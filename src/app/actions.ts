"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, AccessError } from "@/lib/auth";
import { supabaseServer, configured } from "@/lib/supabase/server";
import { bookingSchema, priceSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

function failure(error: unknown): ActionResult {
  if (error instanceof AccessError) return { ok: false, error: error.message };
  const e = error as { code?: string; message?: string };
  if (e.code === "23P01")
    return {
      ok: false,
      code: "conflict",
      error:
        "กล้องมีคิวทับซ้อนแล้ว กรุณาโหลดข้อมูลล่าสุดและเลือกวันหรือกล้องอื่น",
    };
  if (e.code === "40001" || e.message?.includes("STALE_VERSION"))
    return {
      ok: false,
      code: "stale",
      error: "มีแอดมินแก้ไขคิวนี้แล้ว กรุณาโหลดคิวล่าสุดก่อนแก้ไข",
    };
  if (e.code === "23505")
    return { ok: false, error: "ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว" };
  if (e.message?.includes("INACTIVE"))
    return { ok: false, error: "มีรายการที่ถูกปิดใช้งาน กรุณาเลือกใหม่" };
  return { ok: false, error: "บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลและลองอีกครั้ง" };
}
export async function signIn(
  _previous: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  if (!configured()) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
  const parsed = z
    .object({ email: z.email(), password: z.string().min(1) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success)
    return { ok: false, error: "กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง" };
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error)
    return {
      ok: false,
      error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือไม่สามารถเชื่อมต่อได้",
    };
  try {
    await requireAdmin();
  } catch {
    await db.auth.signOut();
    return { ok: false, error: "บัญชีนี้ไม่ได้รับสิทธิ์แอดมิน" };
  }
  redirect("/");
}
export async function signOut() {
  if (configured()) {
    const db = await supabaseServer();
    await db.auth.signOut();
  }
  redirect("/login");
}
export async function saveBooking(input: unknown): Promise<ActionResult> {
  try {
    const { db } = await requireAdmin();
    const parsed = bookingSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, error: parsed.error.issues[0].message };
    const { data, error } = await db.rpc("save_booking", {
      payload: parsed.data,
    });
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, id: data as string };
  } catch (e) {
    return failure(e);
  }
}
export async function changeStatus(
  id: string,
  version: number,
  status: string,
): Promise<ActionResult> {
  try {
    const { db } = await requireAdmin();
    const parsed = z
      .object({
        id: z.uuid(),
        version: z.number().int().positive(),
        status: z.enum(["booked", "dispatched", "returned", "cancelled"]),
      })
      .parse({ id, version, status });
    const { error } = await db.rpc("set_booking_status", {
      booking_id: parsed.id,
      expected_version: parsed.version,
      new_status: parsed.status,
    });
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
const name = z.string().trim().min(1).max(120),
  active = z.boolean();
const schemas = {
  camera_models: z.object({ name, active }),
  camera_units: z.object({
    model_id: z.uuid(),
    code: z.string().trim().min(1).max(40),
    number: z.string().trim().min(1).max(40),
    color: z.string().trim().min(1).max(60),
    active,
  }),
  rental_rates: z.object({
    model_id: z.uuid(),
    days: z.number().int().min(1).max(3660),
    price: priceSchema,
  }),
  gadgets: z.object({ name, active }),
  delivery_methods: z.object({
    name,
    active,
    days_before: z.number().int().min(0).max(365),
    days_after: z.number().int().min(0).max(365),
    requires_address: z.boolean(),
  }),
};
export async function saveCatalog(
  table: string,
  id: string | undefined,
  input: unknown,
): Promise<ActionResult> {
  try {
    const { db } = await requireAdmin();
    if (!Object.hasOwn(schemas, table))
      return { ok: false, error: "ประเภทข้อมูลไม่ถูกต้อง" };
    const data = schemas[table as keyof typeof schemas].safeParse(input);
    if (!data.success)
      return { ok: false, error: "กรุณาตรวจข้อมูลให้ครบและถูกต้อง" };
    if (id && !z.uuid().safeParse(id).success)
      return { ok: false, error: "รหัสไม่ถูกต้อง" };
    const record: Record<string, unknown> = data.data;
    const q = id
      ? db.from(table).update(record).eq("id", id)
      : db.from(table).insert(record);
    const { error } = await q.select("id").single();
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
