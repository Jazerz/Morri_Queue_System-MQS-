import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AccessError } from "@/lib/auth";
import { getBookings } from "@/lib/data";
import { exportSchema } from "@/lib/validation";
import { makeExport } from "@/lib/export";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireAdmin();
    const parsed = exportSchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success)
      return NextResponse.json({ error: "ตัวกรองไม่ถูกต้อง" }, { status: 400 });
    const { format, start, end, model, status } = parsed.data;
    const bookings = (await getBookings(db, start, end, "report")).filter(
      (b) => !status || b.status === status,
    );
    const content = await makeExport(bookings, format, model);
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="MQS_${start}_${end}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : "สร้างไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง",
      },
      { status: e instanceof AccessError ? e.status : 500 },
    );
  }
}
