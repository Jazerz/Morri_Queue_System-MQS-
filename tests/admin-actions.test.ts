import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  rpc: vi.fn(),
  createUser: vi.fn(),
  client: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireOwner: mocks.requireOwner,
  AccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAuthAdmin: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { addAdmin, setAdminActive } from "@/app/admin-actions";
import { AccessError } from "@/lib/auth";
const input = {
  mode: "new",
  email: "new@example.com",
  name: "New",
  password: "Example-password-123",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireOwner.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.client.mockReturnValue({
    auth: { admin: { createUser: mocks.createUser } },
  });
  mocks.createUser.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});
it("rejects non-owners before creating any Auth account or changing memberships", async () => {
  mocks.requireOwner.mockRejectedValue(new AccessError(403, "Owner only"));
  expect(await addAdmin(input)).toEqual({ ok: false, error: "Owner only" });
  expect(
    await setAdminActive("00000000-0000-4000-8000-000000000001", false),
  ).toEqual({ ok: false, error: "Owner only" });
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("existing accounts need no privileged client and never change passwords", async () => {
  expect(await addAdmin({ ...input, mode: "existing" })).toEqual({ ok: true });
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("add_admin_member", {
    member_email: input.email,
    member_name: input.name,
  });
});
it("only grants membership after successful account creation", async () => {
  mocks.createUser.mockResolvedValue({ error: new Error("Already exists") });
  expect((await addAdmin(input)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("reports partial provisioning as failure and supports retry via existing account", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "OWNER_REQUIRED" } });
  const result = await addAdmin(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain("สร้างบัญชีแล้ว");
  expect(mocks.revalidate).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ error: null });
  expect(await addAdmin({ ...input, mode: "existing" })).toEqual({ ok: true });
  expect(mocks.createUser).toHaveBeenCalledTimes(1);
});
