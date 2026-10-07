import type { Booking } from "./types";
export function statistics(bookings: Booking[]) {
  const actual = bookings.filter(
    (b) => b.status === "dispatched" || b.status === "returned",
  );
  const models = new Map<
    string,
    { id: string; name: string; bookingIds: Set<string>; units: number }
  >();
  const units = new Map<string, { id: string; name: string; count: number }>();
  for (const b of actual)
    for (const c of b.booking_cameras) {
      const m = models.get(c.model_id) ?? {
        id: c.model_id,
        name: c.model_name,
        bookingIds: new Set<string>(),
        units: 0,
      };
      m.bookingIds.add(b.id);
      m.units++;
      models.set(c.model_id, m);
      const u = units.get(c.unit_id) ?? {
        id: c.unit_id,
        name: `${c.model_name} · ${c.unit_code} · ${c.color}`,
        count: 0,
      };
      u.count++;
      units.set(c.unit_id, u);
    }
  return {
    actualCount: actual.length,
    bookedCount: bookings.filter((b) => b.status === "booked").length,
    unitCount: actual.reduce((n, b) => n + b.booking_cameras.length, 0),
    models: [...models.values()]
      .map((m) => ({
        id: m.id,
        name: m.name,
        bookings: m.bookingIds.size,
        units: m.units,
      }))
      .sort((a, b) => b.units - a.units),
    units: [...units.values()].sort((a, b) => b.count - a.count),
  };
}
