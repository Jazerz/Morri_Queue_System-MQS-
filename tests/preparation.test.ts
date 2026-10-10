import { describe, it, expect } from "vitest";
import { preparationTasks, supportsAppointment } from "../src/lib/preparation";
import { todayBangkok } from "../src/lib/dates";
import { demoBookings } from "../src/lib/demo";
import { bookingSchema } from "../src/lib/validation";
import type { Booking } from "../src/lib/types";
function booking(overrides: Partial<Booking> = {}): Booking {
  const fixture = demoBookings()[0];
  return {
    ...fixture,
    start_date: "2026-10-12",
    end_date: "2026-10-14",
    status: "booked",
    delivery_name: "EMS",
    booking_cameras: [
      {
        ...fixture.booking_cameras[0],
        blocked_start: "2026-10-10",
        blocked_end: "2026-10-16",
      },
    ],
    ...overrides,
  };
}
describe("today and tomorrow preparation", () => {
  it("uses the saved EMS buffer, includes completed tasks and deduplicates booking/unit pairs", () => {
    const b = booking();
    b.booking_cameras[0].preparation_completed = true;
    const tasks = preparationTasks([b, b], "2026-10-10");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      date: "2026-10-10",
      completed: true,
      usesBuffer: true,
      showAppointment: false,
      appointmentTime: null,
    });
    expect(preparationTasks([b], "2026-10-12")).toHaveLength(0);
    expect(preparationTasks([b], "2026-10-09")[0].date).toBe("2026-10-10");
  });
  it.each(["นัดรับ", "แมสจากคอน", "แมสจากอ้อม"])(
    "uses rental start and stored appointment for %s",
    (delivery_name) => {
      const b = booking({
        delivery_name,
        start_date: "2026-10-11",
        appointment_time: "14:30:00",
      });
      expect(preparationTasks([b], "2026-10-10")[0]).toMatchObject({
        date: "2026-10-11",
        showAppointment: true,
        appointmentTime: "14:30",
        usesBuffer: false,
      });
      expect(preparationTasks([b], "2026-10-09")).toHaveLength(0);
    },
  );
  it("excludes cancellation, keeps different tasks and reflects date/time/method edits", () => {
    expect(
      preparationTasks([booking({ status: "cancelled" })], "2026-10-10"),
    ).toEqual([]);
    const b = booking();
    b.booking_cameras.push({
      ...b.booking_cameras[0],
      id: "other-camera",
      unit_id: "other-unit",
    });
    expect(preparationTasks([b], "2026-10-10")).toHaveLength(2);
    expect(
      preparationTasks([b, { ...b, id: "another-booking" }], "2026-10-10"),
    ).toHaveLength(4);
    expect(
      preparationTasks([{ ...b, delivery_name: "นัดรับ" }], "2026-10-10"),
    ).toHaveLength(0);
    const edited = {
      ...b,
      delivery_name: "นัดรับ",
      start_date: "2026-10-10",
      appointment_time: "09:15",
    };
    expect(preparationTasks([edited], "2026-10-10")[0].appointmentTime).toBe(
      "09:15",
    );
  });
  it("rolls over at Bangkok midnight including year boundaries and keeps legacy empty appointments", () => {
    const b = booking({ delivery_name: "นัดรับ", start_date: "2027-01-01" });
    expect(
      preparationTasks([b], todayBangkok(new Date("2026-12-31T16:59:59Z")))[0]
        .date,
    ).toBe("2027-01-01");
    expect(
      preparationTasks([b], todayBangkok(new Date("2026-12-31T17:00:00Z")))[0]
        .appointmentTime,
    ).toBeNull();
    expect(supportsAppointment("EMS")).toBe(false);
  });
  it("validates HH:mm appointments at the booking boundary", () => {
    const b = booking();
    const input = {
      ...b,
      expected_version: 1,
      cameras: b.booking_cameras.map((c) => ({
        unit_id: c.unit_id,
        price: c.price,
      })),
      gadgets: [],
    };
    expect(
      bookingSchema.safeParse({ ...input, appointment_time: "14:30" }).success,
    ).toBe(true);
    expect(
      bookingSchema.safeParse({ ...input, appointment_time: null }).success,
    ).toBe(true);
    for (const invalid of ["24:00", "14:61", "2:30", "14:30:45"])
      expect(
        bookingSchema.safeParse({ ...input, appointment_time: invalid })
          .success,
      ).toBe(false);
  });
});
