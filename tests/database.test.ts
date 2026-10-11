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
let legacyBefore: {
  booking: Record<string, unknown>;
  camera: Record<string, unknown>;
};
let legacyAfter: typeof legacyBefore;
let returnBefore: typeof legacyBefore, returnAfter: typeof legacyBefore;
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
  const legacyId = await save(input());
  const snapshot = async () => ({
    booking: (
      await db.query<Record<string, unknown>>(
        "select * from bookings where id=$1",
        [legacyId],
      )
    ).rows[0],
    camera: (
      await db.query<Record<string, unknown>>(
        "select * from booking_cameras where booking_id=$1",
        [legacyId],
      )
    ).rows[0],
  });
  legacyBefore = await snapshot();
  await db.exec(
    await readFile(
      "supabase/migrations/202610100001_camera_preparation.sql",
      "utf8",
    ),
  );
  legacyAfter = await snapshot();
  returnBefore = await snapshot();
  await db.exec(
    await readFile(
      "supabase/migrations/202610110001_return_appointment.sql",
      "utf8",
    ),
  );
  returnAfter = await snapshot();
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
describe("camera preparation persistence", () => {
  it("upgrades existing records without changing saved data or dates", () => {
    expect(legacyAfter.booking).toEqual({
      ...legacyBefore.booking,
      appointment_time: null,
    });
    expect(legacyAfter.camera).toEqual({
      ...legacyBefore.camera,
      preparation_completed: false,
    });
  });
  async function cameras(id: string) {
    return (
      await db.query<{
        id: string;
        unit_id: string;
        preparation_completed: boolean;
      }>(
        "select id,unit_id,preparation_completed from booking_cameras where booking_id=$1 order by unit_id",
        [id],
      )
    ).rows;
  }
  async function tick(
    camera: string,
    version: number,
    completed: boolean,
    user = admin,
  ) {
    return asUser(
      "select set_camera_preparation($1,$2,$3)",
      [camera, version, completed],
      user,
    );
  }
  it("persists each camera's checkbox through edits and status changes without changing the rental status", async () => {
    const body = input({
      delivery_method_id: pickup,
      appointment_time: "14:30",
      cameras: [
        { unit_id: unitA, price: 100 },
        { unit_id: unitB, price: 200 },
      ],
    });
    const id = await save(body);
    const initial = await cameras(id);
    expect(initial.every((c) => !c.preparation_completed)).toBe(true);
    await tick(initial[0].id, 1, true);
    expect(await read(id)).toMatchObject({ status: "booked", version: 2 });
    expect((await cameras(id)).map((c) => c.preparation_completed)).toEqual([
      true,
      false,
    ]);
    await save({ ...body, id, expected_version: 2, appointment_time: "15:45" });
    expect((await cameras(id))[0]).toEqual({
      ...initial[0],
      preparation_completed: true,
    });
    expect(
      (
        await db.query<{ appointment_time: string }>(
          "select appointment_time::text from bookings where id=$1",
          [id],
        )
      ).rows[0].appointment_time,
    ).toBe("15:45:00");
    await asUser("select set_booking_status($1,3,'dispatched')", [id]);
    expect((await cameras(id))[0].preparation_completed).toBe(true);
    await tick(initial[0].id, 4, false);
    expect((await cameras(id))[0].preparation_completed).toBe(false);
    expect(await read(id)).toMatchObject({ status: "dispatched", version: 5 });
  });
  it("isolates other bookings of the same camera and new cameras start unchecked", async () => {
    const id = await save(input());
    const camera = (await cameras(id))[0];
    await tick(camera.id, 1, true);
    const other = await save(
      input({ start_date: "2026-11-10", end_date: "2026-11-12" }),
    );
    expect((await cameras(other))[0].preparation_completed).toBe(false);
    await save(
      input({
        id,
        expected_version: 2,
        start_date: "2026-10-20",
        end_date: "2026-10-22",
        cameras: [
          { unit_id: unitA, price: 100 },
          { unit_id: unitB, price: 100 },
        ],
      }),
    );
    expect((await cameras(id)).map((c) => c.preparation_completed)).toEqual([
      true,
      false,
    ]);
    expect((await cameras(id))[0].id).toBe(camera.id);
  });
  it("rejects stale, cancelled, removed, and unauthorized task updates", async () => {
    const id = await save(input());
    const camera = (await cameras(id))[0];
    await tick(camera.id, 1, true);
    await expect(tick(camera.id, 1, false)).rejects.toThrow("STALE_VERSION");
    await expect(tick(camera.id, 2, false, outsider)).rejects.toThrow(
      "ADMIN_REQUIRED",
    );
    await expect(
      asUser(
        "select set_camera_preparation($1,2,false)",
        [camera.id],
        "",
        "anon",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser(
        "update booking_cameras set preparation_completed=false where id=$1",
        [camera.id],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser("select set_booking_status($1,2,'cancelled')", [id]);
    await expect(tick(camera.id, 3, false)).rejects.toThrow("TASK_CANCELLED");
    await save(
      input({
        id,
        expected_version: 3,
        status: "cancelled",
        cameras: [{ unit_id: unitB, price: 100 }],
      }),
    );
    await expect(tick(camera.id, 4, false)).rejects.toThrow("TASK_NOT_FOUND");
    await db.exec(
      `update admin_members set active=false where user_id='${admin}'`,
    );
    await expect(tick((await cameras(id))[0].id, 4, true)).rejects.toThrow(
      "ADMIN_REQUIRED",
    );
  });
  it("retains optional legacy times, validates times and removes appointment time for EMS", async () => {
    const id = await save(
      input({ delivery_method_id: pickup, appointment_time: "00:00" }),
    );
    await save(input({ id, expected_version: 1, delivery_method_id: pickup }));
    expect(
      (
        await db.query(
          "select appointment_time::text from bookings where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ appointment_time: "00:00:00" });
    await expect(
      save(
        input({
          id,
          expected_version: 2,
          delivery_method_id: pickup,
          appointment_time: "24:30",
        }),
      ),
    ).rejects.toThrow("INVALID_APPOINTMENT_TIME");
    await save(input({ id, expected_version: 2, appointment_time: "14:30" }));
    expect(
      (
        await db.query("select appointment_time from bookings where id=$1", [
          id,
        ])
      ).rows[0],
    ).toEqual({ appointment_time: null });
  });
});

describe("next-day return persistence and availability", () => {
  const timed = (extra: Record<string, unknown> = {}) =>
    input({
      delivery_method_id: pickup,
      appointment_time: "09:00",
      return_appointment_time: "11:00",
      ...extra,
    });
  it("adds a nullable return time without changing any legacy values", () => {
    expect(returnAfter.booking).toEqual({
      ...returnBefore.booking,
      return_appointment_time: null,
    });
    expect(returnAfter.camera).toEqual(returnBefore.camera);
  });
  it("reruns the upgrade and repairs a column-only setup without losing saved data", async () => {
    const id = await save(timed());
    const snapshot = async () => ({
      bookings: (await db.query("select * from bookings order by id")).rows,
      cameras: (await db.query("select * from booking_cameras order by id"))
        .rows,
      gadgets: (
        await db.query(
          "select * from booking_gadgets order by booking_id,gadget_id",
        )
      ).rows,
    });
    const before = await snapshot();
    const migration = await readFile(
      "supabase/migrations/202610110001_return_appointment.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    expect(await snapshot()).toEqual(before);
    // Simulate a previous partial/manual setup inside this disposable database.
    await db.exec(
      "drop function public.booking_occupied_interval(date,date,integer,integer,text,time,time); alter table public.bookings drop constraint bookings_return_appointment_time_check;",
    );
    await db.exec(migration);
    expect(await snapshot()).toEqual(before);
    await expect(
      db.query(
        "update bookings set return_appointment_time='24:00' where id=$1",
        [id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await save(
      timed({ id, expected_version: 1, return_appointment_time: "12:00" }),
    );
    await expect(
      save(
        timed({
          start_date: "2026-10-13",
          end_date: "2026-10-13",
          appointment_time: "11:59",
        }),
      ),
    ).rejects.toMatchObject({ code: "23P01" });
  });
  it("saves, edits, preserves omitted times and preparation flags, clears explicitly and excludes EMS", async () => {
    const id = await save(timed());
    const camera = (
      await db.query<{ id: string }>(
        "select id from booking_cameras where booking_id=$1",
        [id],
      )
    ).rows[0];
    await asUser("select set_camera_preparation($1,1,true)", [camera.id]);
    await save(input({ id, expected_version: 2, delivery_method_id: pickup }));
    const getTime = async () =>
      (
        await db.query<{ time: string | null }>(
          "select return_appointment_time::text as time from bookings where id=$1",
          [id],
        )
      ).rows[0].time;
    expect(await getTime()).toBe("11:00:00");
    await asUser("select set_booking_status($1,3,'dispatched')", [id]);
    expect(await getTime()).toBe("11:00:00");
    expect(
      (
        await db.query<{ preparation_completed: boolean }>(
          "select preparation_completed from booking_cameras where id=$1",
          [camera.id],
        )
      ).rows[0].preparation_completed,
    ).toBe(true);
    await save(
      timed({ id, expected_version: 4, return_appointment_time: "12:15" }),
    );
    expect(await getTime()).toBe("12:15:00");
    await save(
      timed({ id, expected_version: 5, return_appointment_time: null }),
    );
    expect(await getTime()).toBeNull();
    await save(timed({ id, expected_version: 6, delivery_method_id: ems }));
    expect(await getTime()).toBeNull();
    await expect(save(timed({ id, expected_version: 6 }))).rejects.toThrow(
      "STALE_VERSION",
    );
  });
  it("rejects earlier pickup and missing times, permits exact-time pickup, rolls back multi-camera bookings", async () => {
    const first = await save(timed());
    const next = { start_date: "2026-10-13", end_date: "2026-10-13" };
    for (const appointment_time of ["10:59", null]) {
      await expect(
        save(
          timed({
            ...next,
            appointment_time,
            cameras: [
              { unit_id: unitB, price: 100 },
              { unit_id: unitA, price: 100 },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: "23P01" });
      expect(
        (
          await db.query<{ n: number }>(
            "select count(*)::int as n from bookings",
          )
        ).rows[0].n,
      ).toBe(1);
    }
    const second = await save(timed({ ...next, appointment_time: "11:00" }));
    await expect(
      save(
        timed({
          id: first,
          expected_version: 1,
          return_appointment_time: "11:01",
        }),
      ),
    ).rejects.toMatchObject({ code: "23P01" });
    expect((await read(first)).version).toBe(1);
    await asUser("select set_booking_status($1,1,'cancelled')", [second]);
    await save(
      timed({
        id: first,
        expected_version: 1,
        return_appointment_time: "12:00",
      }),
    );
    await expect(
      asUser("select set_booking_status($1,2,'booked')", [second]),
    ).rejects.toMatchObject({ code: "23P01" });
  });
  it("checks reverse insertion order, unknown returns and midnight explicitly", async () => {
    await save(
      timed({
        start_date: "2026-10-13",
        end_date: "2026-10-13",
        appointment_time: "10:00",
      }),
    );
    await expect(save(timed())).rejects.toMatchObject({ code: "23P01" });
    await expect(
      save(timed({ return_appointment_time: null })),
    ).rejects.toMatchObject({ code: "23P01" });
    await save(timed({ return_appointment_time: "09:00" }));
    await save(
      timed({
        cameras: [{ unit_id: unitB, price: 100 }],
        return_appointment_time: "00:00",
      }),
    );
    await expect(
      save(
        timed({
          start_date: "2026-10-13",
          end_date: "2026-10-13",
          cameras: [{ unit_id: unitB, price: 100 }],
          appointment_time: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "23P01" });
    await save(
      timed({
        start_date: "2026-10-13",
        end_date: "2026-10-13",
        cameras: [{ unit_id: unitB, price: 100 }],
        appointment_time: "00:00",
      }),
    );
  });
  it("validates HH:mm and ignores return times for methods with shipping buffers", async () => {
    for (const return_appointment_time of [
      "24:00",
      "11:60",
      "2:00",
      "11:00:45",
    ]) {
      await expect(save(timed({ return_appointment_time }))).rejects.toThrow(
        "INVALID_RETURN_APPOINTMENT_TIME",
      );
    }
    await db.query("update delivery_methods set days_before=1 where id=$1", [
      pickup,
    ]);
    const id = await save(timed());
    expect(
      (
        await db.query<{ return_appointment_time: string | null }>(
          "select return_appointment_time from bookings where id=$1",
          [id],
        )
      ).rows[0].return_appointment_time,
    ).toBeNull();
    await db.query("update delivery_methods set days_before=0 where id=$1", [
      pickup,
    ]);
    await save(timed({ id, expected_version: 1 }));
    expect((await read(id)).days_before).toBe(1);
    expect(
      (
        await db.query<{ return_appointment_time: string | null }>(
          "select return_appointment_time from bookings where id=$1",
          [id],
        )
      ).rows[0].return_appointment_time,
    ).toBeNull();
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
