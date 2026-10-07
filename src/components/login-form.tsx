"use client";
import { useActionState } from "react";
import { signIn } from "@/app/actions";
import { Notice } from "./ui";
export function LoginForm({
  denied = false,
  configured = true,
}: {
  denied?: boolean;
  configured?: boolean;
}) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="stack">
      {denied && (
        <Notice kind="error">บัญชีนี้ไม่มีสิทธิ์แอดมิน หรือถูกปิดใช้งาน</Notice>
      )}
      <label>
        อีเมล
        <input
          type="email"
          name="email"
          autoComplete="username"
          placeholder="you@example.com"
          required
        />
      </label>
      <label>
        รหัสผ่าน
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="รหัสผ่านของคุณ"
          required
        />
      </label>
      {state && !state.ok && <Notice kind="error">{state.error}</Notice>}
      <button className="button primary" disabled={pending || !configured}>
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
      <p className="help">
        ใช้อีเมลและรหัสผ่านที่แอดมินหลักสร้างให้
        <br />
        หากลืมรหัสผ่าน ให้ติดต่อผู้ดูแลบัญชี
      </p>
    </form>
  );
}
