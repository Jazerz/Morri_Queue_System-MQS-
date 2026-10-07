import "server-only";
import { configured, supabaseServer } from "./supabase/server";
export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireAdmin() {
  if (!configured()) throw new AccessError(503, "ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  const db = await supabaseServer();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new AccessError(401, "กรุณาเข้าสู่ระบบ");
  const { data: member, error: memberError } = await db
    .from("admin_members")
    .select("display_name,active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError || !member?.active)
    throw new AccessError(403, "บัญชีนี้ไม่มีสิทธิ์แอดมิน หรือถูกปิดใช้งาน");
  return { db, user, displayName: member.display_name as string };
}
