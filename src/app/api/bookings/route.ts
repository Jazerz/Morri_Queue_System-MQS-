import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AccessError } from "@/lib/auth";
import { getBooking, getBookings } from "@/lib/data";
import { validDate } from "@/lib/dates";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireAdmin();
    const p = request.nextUrl.searchParams;
    const id = p.get("id");
    if (id) {
      if (!z.uuid().safeParse(id).success)
        return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
      return NextResponse.json(await getBooking(db, id), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const start = p.get("start") ?? "",
      end = p.get("end") ?? "";
    if (!validDate(start) || !validDate(end) || end < start)
      return NextResponse.json({ error: "ช่วงวันไม่ถูกต้อง" }, { status: 400 });
    return NextResponse.json(
      await getBookings(
        db,
        start,
        end,
        p.get("mode") === "report" ? "report" : "calendar",
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AccessError ? e.message : "โหลดคิวไม่สำเร็จ" },
      { status: e instanceof AccessError ? e.status : 500 },
    );
  }
}
