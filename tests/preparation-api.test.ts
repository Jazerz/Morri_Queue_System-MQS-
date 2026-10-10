import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getBookings: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
  AccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/data", () => ({ getBookings: mocks.getBookings }));
import { GET, PATCH } from "../src/app/api/preparation/route";
import { AccessError } from "@/lib/auth";
const id = "00000000-0000-4000-8000-000000000001";
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/preparation", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.getBookings.mockResolvedValue([]);
  mocks.rpc.mockResolvedValue({ error: null });
});
it("protects both reads and writes before accessing data", async () => {
  mocks.requireAdmin.mockRejectedValue(new AccessError(403, "ไม่มีสิทธิ์"));
  expect((await GET()).status).toBe(403);
  expect(
    (await PATCH(request({ id, version: 1, completed: true }))).status,
  ).toBe(403);
  expect(mocks.getBookings).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("loads an independent Bangkok today/tomorrow range with no caching", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-31T17:01:00Z"));
  try {
    const result = await GET();
    expect(await result.json()).toEqual({ today: "2027-01-01", tasks: [] });
    expect(mocks.getBookings).toHaveBeenCalledWith(
      expect.anything(),
      "2027-01-01",
      "2027-01-02",
    );
    expect(result.headers.get("Cache-Control")).toContain("no-store");
  } finally {
    vi.useRealTimers();
  }
});
it("only writes the specified camera's completion using the current version", async () => {
  expect(
    (await PATCH(request({ id, version: 3, completed: false }))).status,
  ).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("set_camera_preparation", {
    camera_id: id,
    expected_version: 3,
    completed: false,
  });
  expect(
    (await PATCH(request({ id, version: 3, completed: "false" }))).status,
  ).toBe(400);
  mocks.rpc.mockResolvedValue({
    error: { code: "40001", message: "STALE_VERSION" },
  });
  expect(
    (await PATCH(request({ id, version: 3, completed: true }))).status,
  ).toBe(409);
});
