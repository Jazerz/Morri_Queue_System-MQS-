import { describe, it, expect } from "vitest";
import { Client } from "pg";
import { readFile } from "node:fs/promises";
// Runs against an isolated, disposable PostgreSQL database in CI. Never point
// MQS_TEST_DATABASE_URL at Supabase or a database containing user data.
describe.skipIf(!process.env.MQS_TEST_DATABASE_URL)(
  "real PostgreSQL concurrent sessions",
  () => {
    it("only one overlapping request commits and the loser rolls back every item", async () => {
      const setup = new Client({
        connectionString: process.env.MQS_TEST_DATABASE_URL,
      });
      await setup.connect();
      const a = new Client({
          connectionString: process.env.MQS_TEST_DATABASE_URL,
        }),
        b = new Client({ connectionString: process.env.MQS_TEST_DATABASE_URL });
      try {
        // Refuse to initialize any nonempty application database.
        const tables = await setup.query(
          "select tablename from pg_tables where schemaname in ('public','auth')",
        );
        if (tables.rows.length)
          throw new Error(
            "Concurrency test requires an empty disposable database",
          );
        await setup.query(
          `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`,
        );
        await setup.query(
          await readFile("supabase/migrations/202610070001_mqs.sql", "utf8"),
        );
        await setup.query(
          await readFile(
            "supabase/migrations/202610100001_camera_preparation.sql",
            "utf8",
          ),
        );
        await setup.query(
          await readFile(
            "supabase/migrations/202610110001_return_appointment.sql",
            "utf8",
          ),
        );
        const userA = "00000000-0000-4000-8000-000000000001",
          userB = "00000000-0000-4000-8000-000000000002";
        await setup.query(`insert into auth.users values($1),($2)`, [
          userA,
          userB,
        ]);
        await setup.query(
          "insert into admin_members values($1,'A',true),($2,'B',true)",
          [userA, userB],
        );
        const model = (
          await setup.query(
            "insert into camera_models(name) values('Test') returning id",
          )
        ).rows[0].id;
        const units = (
          await setup.query(
            "insert into camera_units(model_id,code,number,color) values($1,'A','1','black'),($1,'B','2','black') returning id",
            [model],
          )
        ).rows;
        const method = (
          await setup.query("select id from delivery_methods where name='EMS'")
        ).rows[0].id;
        const payload = {
          customer_name: "Test",
          phone: "0800000000",
          address: "Test only",
          notes: "",
          start_date: "2026-10-10",
          end_date: "2026-10-12",
          delivery_method_id: method,
          status: "booked",
          cameras: units.map((u) => ({ unit_id: u.id, price: 100 })),
          gadgets: [],
        };
        await Promise.all([a.connect(), b.connect()]);
        const pickup = (
          await setup.query(
            "select id from delivery_methods where name='นัดรับ'",
          )
        ).rows[0].id;
        const timed = {
          ...payload,
          delivery_method_id: pickup,
          start_date: "2026-11-10",
          end_date: "2026-11-12",
          appointment_time: "09:00",
          return_appointment_time: "11:00",
        };
        let committed = 0;
        // The second race overlaps ONLY the next-day return time, beyond the
        // existing date exclusion constraint. It must wait on the camera lock.
        for (const [first, second] of [
          [payload, payload],
          [
            timed,
            {
              ...timed,
              start_date: "2026-11-13",
              end_date: "2026-11-13",
              appointment_time: "10:00",
            },
          ],
        ]) {
          for (const [client, user] of [
            [a, userA],
            [b, userB],
          ] as const) {
            await client.query("begin;set local role authenticated");
            await client.query(
              "select set_config('request.jwt.claim.sub',$1,true)",
              [user],
            );
          }
          await a.query("select save_booking($1::jsonb)", [
            JSON.stringify(first),
          ]);
          const pid = (await b.query("select pg_backend_pid() as pid")).rows[0]
            .pid;
          const loser = b
            .query("select save_booking($1::jsonb)", [JSON.stringify(second)])
            .then(
              () => ({ code: "unexpected success" }),
              (e) => e as { code: string },
            );
          let blocked = false;
          const deadline = Date.now() + 5000;
          while (Date.now() < deadline) {
            const waiting = await setup.query(
              "select wait_event_type from pg_stat_activity where pid=$1",
              [pid],
            );
            if (waiting.rows[0]?.wait_event_type === "Lock") {
              blocked = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          await a.query("commit");
          expect(blocked).toBe(true);
          expect((await loser).code).toBe("23P01");
          await b.query("rollback");
          committed++;
          expect(
            (await setup.query("select count(*)::int as count from bookings"))
              .rows[0].count,
          ).toBe(committed);
          expect(
            (
              await setup.query(
                "select count(*)::int as count from booking_cameras",
              )
            ).rows[0].count,
          ).toBe(committed * 2);
        }
      } finally {
        await Promise.allSettled([a.end(), b.end(), setup.end()]);
      }
    }, 60000);
  },
);
