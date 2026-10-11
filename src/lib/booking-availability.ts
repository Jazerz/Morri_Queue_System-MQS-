import { addDays, overlaps } from "./dates";
import type { Booking } from "./types";

export type BookingSchedule = Pick<
  Booking,
  | "start_date"
  | "end_date"
  | "days_before"
  | "days_after"
  | "delivery_name"
  | "appointment_time"
  | "return_appointment_time"
>;

export function supportsNextDayReturn(
  schedule: Pick<
    BookingSchedule,
    "delivery_name" | "days_before" | "days_after"
  >,
) {
  return (
    schedule.days_before === 0 &&
    schedule.days_after === 0 &&
    /นัดรับ|แมส|เเมส|messenger|pickup/i.test(schedule.delivery_name)
  );
}

// Bangkok wall-clock values, compared without converting them to the host timezone.
// Unknown appointments conservatively reserve the whole handover/return day.
export function occupiedInterval(schedule: BookingSchedule) {
  const timed = supportsNextDayReturn(schedule);
  return {
    start: `${addDays(schedule.start_date, -schedule.days_before)}T${timed ? schedule.appointment_time?.slice(0, 5) || "00:00" : "00:00"}`,
    end: timed
      ? `${addDays(schedule.end_date, schedule.return_appointment_time ? 1 : 2)}T${schedule.return_appointment_time?.slice(0, 5) || "00:00"}`
      : `${addDays(schedule.end_date, schedule.days_after + 1)}T00:00`,
  };
}

export function schedulesOverlap(a: BookingSchedule, b: BookingSchedule) {
  // Retain the existing whole-day rental/shipping rule; times only allow a
  // handover on the day AFTER the preceding rental ends.
  if (
    overlaps(
      addDays(a.start_date, -a.days_before),
      addDays(a.end_date, a.days_after),
      addDays(b.start_date, -b.days_before),
      addDays(b.end_date, b.days_after),
    )
  )
    return true;
  if (supportsNextDayReturn(a) && supportsNextDayReturn(b)) {
    if (
      addDays(a.end_date, 1) === b.start_date &&
      (!a.return_appointment_time || !b.appointment_time)
    )
      return true;
    if (
      addDays(b.end_date, 1) === a.start_date &&
      (!b.return_appointment_time || !a.appointment_time)
    )
      return true;
  }
  const x = occupiedInterval(a),
    y = occupiedInterval(b);
  return x.start < y.end && y.start < x.end;
}
