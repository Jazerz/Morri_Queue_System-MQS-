"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AccessError, requireOwner } from "@/lib/auth";
import { supabaseAuthAdmin } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

function failure(error: unknown): ActionResult {
  if (error instanceof AccessError) return { ok: false, error: error.message };
  const e = error as { message?: string; code?: string };
  if (e.message?.includes("ADMIN_KEY_MISSING"))
    return {
      ok: false,
      error: "ยังไม่ได้ตั้งค่า secret key ฝั่งเซิร์ฟเวอร์สำหรับสร้างบัญชี",
    };
  if (e.message?.includes("USER_NOT_FOUND"))
    return { ok: false, error: "ไม่พบบัญชีอีเมลนี้ กรุณาเลือกสร้างบัญชีใหม่" };
  if (e.code === "23505")
    return {
      ok: false,
      error: "บัญชีนี้เป็นสมาชิกแล้ว เปิดสิทธิ์อีกครั้งจากรายชื่อด้านล่างได้",
    };
  return {
    ok: false,
    error: "ดำเนินการไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่",
  };
}

export async function addAdmin(input: unknown): Promise<ActionResult> {
  try {
    const { db } = await requireOwner();
    const parsed = z
      .discriminatedUnion("mode", [
        z.object({
          mode: z.literal("new"),
          email: z.email(),
          name: z.string().trim().min(1).max(120),
          password: z.string().min(12).max(128),
        }),
        z.object({
          mode: z.literal("existing"),
          email: z.email(),
          name: z.string().trim().min(1).max(120),
        }),
      ])
      .safeParse(input);
    if (!parsed.success)
      return {
        ok: false,
        error: "กรอกชื่อ อีเมล และรหัสผ่านใหม่อย่างน้อย 12 ตัวอักษรให้ครบ",
      };
    const values = parsed.data;
    if (values.mode === "new") {
      const authAdmin = supabaseAuthAdmin();
      const { error } = await authAdmin.auth.admin.createUser({
        email: values.email,
        password: values.password,
        email_confirm: true,
      });
      if (error)
        return {
          ok: false,
          error:
            "สร้างบัญชีไม่สำเร็จ อีเมลอาจมีบัญชีอยู่แล้ว หรือรหัสผ่านไม่ผ่านเงื่อนไข ลองเพิ่มจากบัญชีที่มีอยู่",
        };
    }
    // Check owner authority again in PostgreSQL; no service-role membership writes.
    const { error } = await db.rpc("add_admin_member", {
      member_email: values.email,
      member_name: values.name,
    });
    if (error) {
      if (values.mode === "new")
        return {
          ok: false,
          error:
            "สร้างบัญชีแล้ว แต่ยังเพิ่มสิทธิ์ไม่สำเร็จ บัญชีนี้ยังเข้าแอปไม่ได้ ให้ลองเพิ่มจากบัญชีที่มีอยู่ด้วยอีเมลเดิม",
        };
      throw error;
    }
    revalidatePath("/admins");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function setAdminActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const { db } = await requireOwner();
    const parsed = z
      .object({ id: z.uuid(), active: z.boolean() })
      .safeParse({ id, active });
    if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
    const { error } = await db.rpc("set_admin_active", {
      member_id: parsed.data.id,
      enabled: parsed.data.active,
    });
    if (error) throw error;
    revalidatePath("/admins");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
