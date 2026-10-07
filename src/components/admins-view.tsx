"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAdmin, setAdminActive } from "@/app/admin-actions";
import { Notice, PageHeading } from "./ui";

export type AdminMember = {
  user_id: string;
  display_name: string;
  email: string;
  active: boolean;
  role: "owner" | "admin";
};

export function AdminsView({
  members,
  demo = false,
}: {
  members: AdminMember[];
  demo?: boolean;
}) {
  const [mode, setMode] = useState("new");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <>
      <PageHeading
        eyebrow="ADMIN ACCESS"
        title="จัดการแอดมิน"
        description="แอดมินหลักเป็นผู้เพิ่มบัญชีและเปิด–ปิดสิทธิ์ของทีม"
      />
      <section className="panel admin-panel">
        <h2>เพิ่มแอดมิน</h2>
        <p className="help">
          แอดมินทั่วไปจัดการคิว กล้อง และข้อมูลการเช่าได้
          แต่จัดการสิทธิ์คนอื่นไม่ได้
        </p>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            if (demo) {
              setMessage({
                ok: false,
                text: "หน้าตัวอย่างเท่านั้น ยังไม่ได้สร้างบัญชีหรือเพิ่มสิทธิ์จริง",
              });
              return;
            }
            startTransition(async () => {
              try {
                const result = await addAdmin({
                  mode,
                  name: data.get("name"),
                  email: data.get("email"),
                  password: data.get("password"),
                });
                setMessage({
                  ok: result.ok,
                  text: result.ok
                    ? "เพิ่มแอดมินแล้ว ส่งลิงก์หน้าเข้าสู่ระบบและข้อมูลบัญชีให้เจ้าของบัญชีโดยตรง"
                    : result.error,
                });
                if (result.ok) {
                  form.reset();
                  router.refresh();
                }
              } catch {
                setMessage({
                  ok: false,
                  text: "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่",
                });
              }
            });
          }}
        >
          <label>
            ประเภทบัญชี
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={pending}
            >
              <option value="new">สร้างบัญชีใหม่</option>
              <option value="existing">เพิ่มสิทธิ์บัญชีที่มีอยู่แล้ว</option>
            </select>
          </label>
          <div className="form-grid">
            <label>
              ชื่อแอดมิน
              <input name="name" required maxLength={120} disabled={pending} />
            </label>
            <label>
              อีเมล
              <input
                name="email"
                type="email"
                required
                autoComplete="off"
                disabled={pending}
              />
            </label>
          </div>
          {mode === "new" && (
            <label>
              รหัสผ่านเริ่มต้น
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                disabled={pending}
              />
              <span className="help">
                อย่างน้อย 12 ตัวอักษร กรุณาตรวจสอบอีเมลของผู้รับก่อนสร้างบัญชี
              </span>
            </label>
          )}
          <button className="button primary" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "เพิ่มแอดมิน"}
          </button>
        </form>
      </section>
      {message && (
        <Notice kind={message.ok ? "success" : "error"}>{message.text}</Notice>
      )}
      <section className="panel admin-panel">
        <h2>สมาชิกทีม ({members.length})</h2>
        <div className="admin-members">
          {members.map((member) => (
            <div className="admin-member" key={member.user_id}>
              <div>
                <strong>{member.display_name}</strong>
                <p>{member.email}</p>
                <small>
                  {member.role === "owner" ? "แอดมินหลัก" : "แอดมิน"} ·{" "}
                  {member.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                </small>
              </div>
              {member.role === "admin" && (
                <button
                  className="button secondary"
                  disabled={pending}
                  onClick={() => {
                    if (demo) {
                      setMessage({
                        ok: false,
                        text: "หน้าตัวอย่างเท่านั้น ยังไม่ได้เปลี่ยนสิทธิ์จริง",
                      });
                      return;
                    }
                    startTransition(async () => {
                      try {
                        const result = await setAdminActive(
                          member.user_id,
                          !member.active,
                        );
                        setMessage({
                          ok: result.ok,
                          text: result.ok ? "อัปเดตสิทธิ์แล้ว" : result.error,
                        });
                        if (result.ok) router.refresh();
                      } catch {
                        setMessage({
                          ok: false,
                          text: "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่",
                        });
                      }
                    });
                  }}
                >
                  {member.active ? "ปิดสิทธิ์" : "เปิดสิทธิ์"}
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="help">
          ปิดสิทธิ์แล้วจะเข้าใช้งานข้อมูลไม่ได้ ประวัติคิวเดิมยังคงอยู่
          บัญชีแอดมินหลักปิดสิทธิ์ผ่านหน้านี้ไม่ได้
        </p>
      </section>
    </>
  );
}
