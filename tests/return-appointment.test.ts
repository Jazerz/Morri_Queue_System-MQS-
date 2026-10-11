import { describe, expect, it } from "vitest";
import {
  occupiedInterval,
  schedulesOverlap,
  supportsNextDayReturn,
  type BookingSchedule,
} from "../src/lib/booking-availability";
import { preparationTasks } from "../src/lib/preparation";
import { bookingSchema } from "../src/lib/validation";
import { demoBookings } from "../src/lib/demo";

const schedule: BookingSchedule = {
  start_date: "2026-10-10",
  end_date: "2026-10-12",
  days_before: 0,
  days_after: 0,
  delivery_name: "นัดรับ",
  appointment_time: "09:00",
  return_appointment_time: "11:00",
};
describe("next-day return appointments", () => {
  it.each(["นัดรับ", "แมสจากคอน", "แมสจากอ้อม"])(
    "uses the next day for %s and exact-time handovers",
    (delivery_name) => {
      const first = { ...schedule, delivery_name };
      const next = {
        ...first,
        start_date: "2026-10-13",
        end_date: "2026-10-13",
      };
      expect(
        schedulesOverlap(first, { ...next, appointment_time: "10:59" }),
      ).toBe(true);
      expect(
        schedulesOverlap(first, { ...next, appointment_time: "11:00" }),
      ).toBe(false);
      expect(
        schedulesOverlap(first, { ...next, appointment_time: "14:00" }),
      ).toBe(false);
      expect(
        schedulesOverlap({ ...next, appointment_time: "10:59" }, first),
      ).toBe(true);
      expect(
        schedulesOverlap(first, {
          ...next,
          start_date: "2026-10-12",
          appointment_time: "23:59",
        }),
      ).toBe(true);
    },
  );
  it("requires both times to release a same-day handover and keeps shipping buffers", () => {
    const next = {
      ...schedule,
      start_date: "2026-10-13",
      end_date: "2026-10-13",
      appointment_time: "14:00",
    };
    expect(
      schedulesOverlap({ ...schedule, return_appointment_time: null }, next),
    ).toBe(true);
    expect(
      schedulesOverlap(schedule, { ...next, appointment_time: null }),
    ).toBe(true);
    // Even a midnight return needs an explicitly scheduled receiving appointment.
    expect(
      schedulesOverlap(
        { ...schedule, return_appointment_time: "00:00" },
        { ...next, appointment_time: null },
      ),
    ).toBe(true);
    for (const variant of [
      { delivery_name: "EMS" },
      { days_before: 1 },
      { days_after: 1 },
    ]) {
      expect(supportsNextDayReturn({ ...schedule, ...variant })).toBe(false);
    }
    expect(
      occupiedInterval({
        ...schedule,
        delivery_name: "EMS",
        days_before: 2,
        days_after: 2,
      }),
    ).toEqual({
      start: "2026-10-08T00:00",
      end: "2026-10-15T00:00",
    });
  });
  it("handles month/year/leap-day changes and shows saved times on preparation cards", () => {
    for (const [end_date, expected] of [
      ["2026-12-31", "2027-01-01"],
      ["2028-02-28", "2028-02-29"],
      ["2026-10-31", "2026-11-01"],
    ]) {
      const b = {
        ...demoBookings()[0],
        ...schedule,
        start_date: end_date,
        end_date,
      };
      const task = preparationTasks([b], end_date)[0];
      expect(task.returnDate).toBe(expected);
      expect(task.returnTime).toBe("11:00");
    }
    const b = {
      ...demoBookings()[0],
      ...schedule,
      return_appointment_time: null,
    };
    expect(preparationTasks([b], b.start_date)[0].returnTime).toBeNull();
  });
  it("rejects invalid return time input", () => {
    const fixture = demoBookings()[0];
    const input = {
      ...fixture,
      expected_version: 1,
      cameras: fixture.booking_cameras.map((c) => ({
        unit_id: c.unit_id,
        price: c.price,
      })),
      gadgets: [],
    };
    for (const time of ["00:00", "23:59", null, undefined])
      expect(
        bookingSchema.safeParse({ ...input, return_appointment_time: time })
          .success,
      ).toBe(true);
    for (const time of ["24:00", "11:61", "2:30", "11:00:30"])
      expect(
        bookingSchema.safeParse({ ...input, return_appointment_time: time })
          .success,
      ).toBe(false);
  });
});
