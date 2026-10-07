import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFile } from "node:fs/promises";

const owner = "00000000-0000-4000-8000-000000000001";
const admin = "00000000-0000-4000-8000-000000000002";
const outsider = "00000000-0000-4000-8000-000000000003";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon;`);
  for (const migration of [
    "202610070001_mqs.sql",
    "202610070002_admin_owner.sql",
  ]) {
    await db.exec(await readFile(`supabase/migrations/${migration}`, "utf8"));
  }
  await db.exec(`insert into auth.users values ('${owner}','owner@example.com'),('${admin}','admin@example.com'),('${outsider}','new@example.com');
    insert into admin_members values ('${owner}','Owner',true,'owner'),('${admin}','Admin',true,'admin');
    insert into camera_models(name) values('Canon');`);
}, 60000);
beforeEach(async () => {
  await db.exec(
    `delete from admin_members where user_id='${outsider}'; update admin_members set active=true;`,
  );
});
afterAll(async () => {
  await db?.close();
});
async function asUser(
  sql: string,
  params: unknown[] = [],
  user = owner,
  role = "authenticated",
) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    return tx.query(sql, params);
  });
}
it("only active owners can list team emails or grant access", async () => {
  expect(
    (await asUser("select * from list_admin_members()")).rows,
  ).toHaveLength(2);
  for (const user of [admin, outsider]) {
    await expect(
      asUser("select * from list_admin_members()", [], user),
    ).rejects.toThrow("OWNER_REQUIRED");
    await expect(
      asUser("select add_admin_member('new@example.com','New')", [], user),
    ).rejects.toThrow("OWNER_REQUIRED");
    await expect(
      asUser("select set_admin_active($1,false)", [admin], user),
    ).rejects.toThrow("OWNER_REQUIRED");
  }
  await db.exec(
    `update admin_members set active=false where user_id='${owner}'`,
  );
  await expect(asUser("select * from list_admin_members()")).rejects.toThrow(
    "OWNER_REQUIRED",
  );
});
it("grants existing Auth accounts admin access without upgrading roles", async () => {
  await asUser("select add_admin_member(' NEW@example.com ','New member')");
  expect(
    (await asUser("select role,active from admin_members", [], outsider)).rows,
  ).toEqual([{ role: "admin", active: true }]);
  await expect(
    asUser("select add_admin_member('new@example.com','Again')"),
  ).rejects.toThrow();
  await expect(
    asUser("select add_admin_member('missing@example.com','Missing')"),
  ).rejects.toThrow("USER_NOT_FOUND");
  await expect(
    asUser("select add_admin_member('new@example.com',' ')"),
  ).rejects.toThrow("INVALID_NAME");
});
it("disabling access blocks existing sessions through RLS; enabling restores it", async () => {
  expect(
    (await asUser("select * from camera_models", [], admin)).rows,
  ).toHaveLength(1);
  await asUser("select set_admin_active($1,false)", [admin]);
  expect(
    (await asUser("select * from camera_models", [], admin)).rows,
  ).toHaveLength(0);
  await expect(
    asUser("insert into camera_models(name) values('Denied')", [], admin),
  ).rejects.toThrow();
  await asUser("select set_admin_active($1,true)", [admin]);
  expect(
    (await asUser("select * from camera_models", [], admin)).rows,
  ).toHaveLength(1);
});
it("protects the owner and prevents direct role escalation even for owners", async () => {
  await expect(
    asUser("select set_admin_active($1,false)", [owner]),
  ).rejects.toThrow("OWNER_PROTECTED");
  await expect(
    asUser("select add_admin_member('owner@example.com','Overwrite')"),
  ).rejects.toThrow();
  for (const user of [owner, admin]) {
    await expect(
      asUser(
        "update admin_members set role='owner' where user_id=$1",
        [admin],
        user,
      ),
    ).rejects.toThrow();
    await expect(
      asUser("delete from admin_members", [], user),
    ).rejects.toThrow();
  }
});
it("anonymous callers cannot call any membership RPC", async () => {
  for (const sql of [
    "select is_owner()",
    "select * from list_admin_members()",
    "select add_admin_member('new@example.com','New')",
    `select set_admin_active('${admin}',false)`,
  ]) {
    await expect(asUser(sql, [], "", "anon")).rejects.toThrow();
  }
});
