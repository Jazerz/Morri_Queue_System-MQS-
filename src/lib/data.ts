import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Booking,
  Catalog,
  Model,
  Unit,
  Rate,
  Gadget,
  Delivery,
} from "./types";
// Explicit paging prevents Supabase's default row limit silently truncating reports.
async function pages<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const result: T[] = [];
  for (let from = 0; ; from += 200) {
    const { data, error } = await query(from, from + 199);
    if (error) throw new Error(error.message);
    const batch = data as T[];
    result.push(...batch);
    if (batch.length < 200) return result;
  }
}
export async function getCatalog(db: SupabaseClient): Promise<Catalog> {
  const [models, units, rates, gadgets, deliveries] = await Promise.all([
    pages<Model>((a, b) =>
      db
        .from("camera_models")
        .select("*")
        .order("name")
        .order("id")
        .range(a, b),
    ),
    pages<Unit>((a, b) =>
      db.from("camera_units").select("*").order("code").range(a, b),
    ),
    pages<Rate>((a, b) =>
      db.from("rental_rates").select("*").order("days").order("id").range(a, b),
    ),
    pages<Gadget>((a, b) =>
      db.from("gadgets").select("*").order("name").order("id").range(a, b),
    ),
    pages<Delivery>((a, b) =>
      db
        .from("delivery_methods")
        .select("*")
        .order("name")
        .order("id")
        .range(a, b),
    ),
  ]);
  return { models, units, rates, gadgets, deliveries };
}
export async function getBookings(
  db: SupabaseClient,
  start: string,
  end: string,
  mode: "calendar" | "report" = "calendar",
) {
  return pages<Booking>((a, b) => {
    let q = db
      .from("bookings")
      .select("*,booking_cameras!inner(*),booking_gadgets(*)")
      .order("start_date")
      .order("id");
    q =
      mode === "calendar"
        ? q
            .lte("booking_cameras.blocked_start", end)
            .gte("booking_cameras.blocked_end", start)
        : q.gte("start_date", start).lte("start_date", end);
    return q.range(a, b);
  });
}
export async function getBooking(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("bookings")
    .select("*,booking_cameras(*),booking_gadgets(*)")
    .eq("id", id)
    .single();
  if (error) throw new Error("ไม่พบคิวหรือไม่มีสิทธิ์เข้าถึง");
  return data as Booking;
}
