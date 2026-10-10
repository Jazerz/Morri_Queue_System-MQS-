import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, AccessError } from "@/lib/auth";
import { getBookings } from "@/lib/data";
import { addDays, todayBangkok } from "@/lib/dates";
import { preparationTasks } from "@/lib/preparation";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try {
    const { db } = await requireAdmin();
    const today = todayBangkok();
    const bookings = await getBookings(db, today, addDays(today, 1));
    return NextResponse.json(
      { today, tasks: preparationTasks(bookings, today) },
      { headers },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : "โหลดรายการเตรียมกล้องไม่สำเร็จ",
      },
      { status: e instanceof AccessError ? e.status : 500, headers },
    );
  }
}
const completionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  completed: z.boolean(),
});
export async function PATCH(request: NextRequest) {
  try {
    const { db } = await requireAdmin();
    const parsed = completionSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "ข้อมูลรายการไม่ถูกต้อง" },
        { status: 400, headers },
      );
    const { error } = await db.rpc("set_camera_preparation", {
      camera_id: parsed.data.id,
      expected_version: parsed.data.version,
      completed: parsed.data.completed,
    });
    if (error) {
      if (
        error.code === "40001" ||
        /TASK_NOT_FOUND|TASK_CANCELLED/.test(error.message)
      )
        return NextResponse.json(
          {
            error:
              "คิวนี้มีการเปลี่ยนแปลงแล้ว กรุณาตรวจรายการล่าสุดและลองอีกครั้ง",
          },
          { status: 409, headers },
        );
      throw error;
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : "บันทึกสถานะไม่สำเร็จ กรุณาลองอีกครั้ง",
      },
      {
        status:
          e instanceof AccessError
            ? e.status
            : e instanceof SyntaxError
              ? 400
              : 500,
        headers,
      },
    );
  }
}
