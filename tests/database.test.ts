import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFile } from "node:fs/promises";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uuid(1),
  admin2 = uuid(2),
  outsider = uuid(3),
  model = uuid(10),
  unitA = uuid(11),
  unitB = uuid(12),
  unitC = uuid(13),
  gadget = uuid(20);
let db: PGlite, ems: string, pickup: string;
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(
    await readFile("supabase/migrations/202610070001_mqs.sql", "utf8"),
  );
  await db.exec(`insert into auth.users values('${admin}'),('${admin2}'),('${outsider}'); insert into admin_members values('${admin}','Admin A',true),('${admin2}','Admin B',true);
  insert into camera_models(id,name) values('${model}','Canon');
  insert into camera_units(id,model_id,code,number,color) values('${unitA}','${model}','A','01','ดำ'),('${unitB}','${model}','B','02','เงิน'),('${unitC}','${model}','C','03','ขาว');
  insert into gadgets(id,name) values('${gadget}','แบตเตอรี่');
  insert into rental_rates(model_id,days,price) values('${model}',3,1200);`);
  const methods = await db.query<{ id: string; name: string }>(
    "select id,name from delivery_methods",
  );
  ems = methods.rows.find((d) => d.name === "EMS")!.id;
  pickup = methods.rows.find((d) => d.name === "นัดรับ")!.id;
}, 60000);
beforeEach(async () => {
  await db.exec(
    "truncate booking_cameras,booking_gadgets,bookings restart identity; update camera_units set active=true; update delivery_methods set active=true,days_before=case when name='EMS' then 2 else 0 end,days_after=case when name='EMS' then 2 else 0 end; update admin_members set active=true;",
  );
});
afterAll(async () => {
  await db?.close();
});
async function asUser<T>(
  sql: string,
  params: unknown[] = [],
  user = admin,
  role = "authenticated",
) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role};`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    return tx.query<T>(sql, params);
  });
}
function input(overrides: Record<string, unknown> = {}) {
  return {
    customer_name: "ลูกค้าทดสอบ",
    phone: "0812345678",
    address: "กรุงเทพ",
    notes: "",
    start_date: "2026-10-10",
    end_date: "2026-10-12",
    delivery_method_id: ems,
    status: "booked",
    cameras: [{ unit_id: unitA, price: 1200 }],
    gadgets: [{ gadget_id: gadget, quantity: 1 }],
    ...overrides,
  };
}
async function save(payload: Record<string, unknown>, user = admin) {
  const r = await asUser<{ id: string }>(
    "select save_booking($1::jsonb) as id",
    [JSON.stringify(payload)],
    user,
  );
  return r.rows[0].id;
}
async function read(id: string) {
  return (
    await db.query<{
      version: number;
      status: string;
      days_before: number;
      days_after: number;
      created_by: string;
      updated_by: string;
    }>("select * from bookings where id=$1", [id])
  ).rows[0];
}

describe("database booking transactions", () => {
  it("creates all cameras with inclusive EMS dates and audit IDs", async () => {
    const id = await save(
      input({
        cameras: [
          { unit_id: unitA, price: 1200 },
          { unit_id: unitB, price: 900 },
        ],
      }),
    );
    const rows = (
      await db.query<{ blocked_start: string; blocked_end: string }>(
        "select blocked_start::text,blocked_end::text from booking_cameras where booking_id=$1",
        [id],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      blocked_start: "2026-10-08",
      blocked_end: "2026-10-14",
    });
    expect(await read(id)).toMatchObject({
      version: 1,
      created_by: admin,
      updated_by: admin,
    });
  });
  it("blocks overlap only in shipping buffers and allows the following day", async () => {
    await save(input());
    await expect(
      save(
        input({
          delivery_method_id: pickup,
          start_date: "2026-10-14",
          end_date: "2026-10-14",
        }),
      ),
    ).rejects.toMatchObject({ code: "23P01" });
    await expect(
      save(
        input({
          delivery_method_id: pickup,
          start_date: "2026-10-15",
          end_date: "2026-10-15",
        }),
      ),
    ).resolves.toBeTruthy();
  });
  it("allows other cameras and rolls back every part of a conflicting multi-camera booking", async () => {
    await save(input());
    await save(input({ cameras: [{ unit_id: unitB, price: 1000 }] }));
    await expect(
      save(
        input({
          cameras: [
            { unit_id: unitC, price: 100 },
            { unit_id: unitA, price: 100 },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "23P01" });
    expect((await db.query("select * from bookings")).rows).toHaveLength(2);
    expect(
      (
        await db.query("select * from booking_cameras where unit_id=$1", [
          unitC,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("edits itself without a conflict; rejects stale versions and updates audit IDs", async () => {
    const id = await save(input());
    await save(
      input({ id, expected_version: 1, customer_name: "เปลี่ยนชื่อ" }),
      admin2,
    );
    expect(await read(id)).toMatchObject({ version: 2, updated_by: admin2 });
    await expect(save(input({ id, expected_version: 1 }))).rejects.toThrow(
      "STALE_VERSION",
    );
  });
  it("failed edit keeps prior booking and all prior allocations", async () => {
    const a = await save(input()),
      b = await save(input({ cameras: [{ unit_id: unitB, price: 1000 }] }));
    await expect(
      save(input({ id: b, expected_version: 1 })),
    ).rejects.toMatchObject({ code: "23P01" });
    expect((await read(b)).version).toBe(1);
    expect(
      (
        await db.query<{ unit_id: string }>(
          "select unit_id from booking_cameras where booking_id=$1",
          [b],
        )
      ).rows[0].unit_id,
    ).toBe(unitB);
    expect(await read(a)).toBeTruthy();
  });
  it("cancellation releases availability and reopening checks overlaps atomically", async () => {
    const id = await save(input());
    await asUser("select set_booking_status($1,1,'cancelled')", [id]);
    await save(input());
    await expect(
      asUser("select set_booking_status($1,2,'booked')", [id]),
    ).rejects.toMatchObject({ code: "23P01" });
    expect((await read(id)).status).toBe("cancelled");
    expect((await read(id)).version).toBe(2);
  });
  it("returned bookings retain their reserved days", async () => {
    const id = await save(input());
    await asUser("select set_booking_status($1,1,'returned')", [id]);
    await expect(save(input())).rejects.toMatchObject({ code: "23P01" });
  });
  it("snapshots rates, delivery settings and labels survive later configuration changes", async () => {
    const id = await save(input());
    await db.exec(
      "update delivery_methods set days_before=5,days_after=5,name='EMS ใหม่' where name='EMS'; update rental_rates set price=9999; update camera_models set name='Canon ใหม่';",
    );
    await save(input({ id, expected_version: 1, notes: "แก้หมายเหตุ" }));
    expect(await read(id)).toMatchObject({ days_before: 2, days_after: 2 });
    const c = (
      await db.query<{ model_name: string; price: string }>(
        "select model_name,price from booking_cameras where booking_id=$1",
        [id],
      )
    ).rows[0];
    expect(c.model_name).toBe("Canon");
    expect(Number(c.price)).toBe(1200);
    await db.exec(
      "update camera_models set name='Canon'; update delivery_methods set name='EMS' where name='EMS ใหม่';",
    );
  });
  it("rejects disabled units for new bookings but preserves existing bookings", async () => {
    const id = await save(input());
    await db.exec(`update camera_units set active=false where id='${unitA}'`);
    await save(input({ id, expected_version: 1 }));
    await expect(
      save(input({ start_date: "2026-11-10", end_date: "2026-11-12" })),
    ).rejects.toThrow("INACTIVE_CAMERA");
  });
  it("requires addresses for shipments and permits pickup without an address", async () => {
    await expect(save(input({ address: "" }))).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      save(input({ delivery_method_id: pickup, address: "" })),
    ).resolves.toBeTruthy();
  });
  it("permits one winner for competing admin requests", async () => {
    const result = await Promise.allSettled([
      save(input(), admin),
      save(input(), admin2),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.query("select * from bookings")).rows).toHaveLength(1);
  });
});
describe("database authorization", () => {
  it("denies anon access and Auth users without membership", async () => {
    await save(input());
    await expect(
      asUser("select * from bookings", [], "", "anon"),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (await asUser("select * from bookings", [], outsider)).rows,
    ).toHaveLength(0);
    await expect(save(input(), outsider)).rejects.toThrow("ADMIN_REQUIRED");
  });
  it("revokes disabled members immediately", async () => {
    await save(input());
    await db.exec(
      `update admin_members set active=false where user_id='${admin}'`,
    );
    expect((await asUser("select * from bookings")).rows).toHaveLength(0);
    await expect(save(input())).rejects.toThrow("ADMIN_REQUIRED");
  });
  it("prevents direct booking writes, deletes and self membership changes", async () => {
    const id = await save(input());
    await expect(
      asUser("update bookings set status='cancelled' where id=$1", [id]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser("delete from camera_units where id=$1", [unitA]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser("update admin_members set active=true"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("allows shared catalog access to admins and denies outsider mutation", async () => {
    expect(
      (await asUser("select * from camera_units", [], admin2)).rows.length,
    ).toBe(3);
    await expect(
      asUser("insert into gadgets(name) values('forbidden')", [], outsider),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
