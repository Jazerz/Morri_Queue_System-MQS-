import { addDays } from "./dates";
import type { Booking } from "./types";

export function supportsAppointment(name: string) {
  return /นัดรับ|แมส|เเมส|messenger|pickup/i.test(name);
}

export type PreparationTask = {
  id: string;
  bookingId: string;
  version: number;
  reference: number;
  modelName: string;
  unitNumber: string;
  color: string;
  unitCode: string;
  deliveryName: string;
  date: string;
  usesBuffer: boolean;
  showAppointment: boolean;
  appointmentTime: string | null;
  completed: boolean;
};
export type PreparationData = { today: string; tasks: PreparationTask[] };

export function preparationTasks(
  bookings: Booking[],
  today: string,
): PreparationTask[] {
  const tomorrow = addDays(today, 1);
  const tasks = new Map<string, PreparationTask>();
  for (const booking of bookings) {
    if (booking.status === "cancelled") continue;
    const showAppointment = supportsAppointment(booking.delivery_name);
    for (const camera of booking.booking_cameras) {
      if (camera.cancelled) continue;
      // EMS (and custom shipping methods) reuse the saved buffer start.
      // Pickup and messenger appointments always use the rental start.
      const date = showAppointment ? booking.start_date : camera.blocked_start;
      if (date !== today && date !== tomorrow) continue;
      tasks.set(`${booking.id}:${camera.unit_id}`, {
        id: camera.id,
        bookingId: booking.id,
        version: booking.version,
        reference: booking.reference,
        modelName: camera.model_name,
        unitNumber: camera.unit_number,
        color: camera.color,
        unitCode: camera.unit_code,
        deliveryName: booking.delivery_name,
        date,
        usesBuffer:
          !showAppointment &&
          (camera.blocked_start < booking.start_date ||
            booking.delivery_name.trim().toUpperCase() === "EMS"),
        showAppointment,
        appointmentTime: showAppointment
          ? booking.appointment_time?.slice(0, 5) || null
          : null,
        completed: camera.preparation_completed ?? false,
      });
    }
  }
  return [...tasks.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.appointmentTime ?? "99:99").localeCompare(
        b.appointmentTime ?? "99:99",
      ) ||
      a.unitCode.localeCompare(b.unitCode) ||
      a.id.localeCompare(b.id),
  );
}
