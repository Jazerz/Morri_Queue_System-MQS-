import Link from "next/link";
import { Camera, ArrowRight, Check } from "lucide-react";
export const dynamic = "force-dynamic";
export default function SetupPage() {
  return (
    <main className="auth-page">
      <section className="auth-card setup-card">
        <span className="brand-icon">
          <Camera size={28} />
        </span>
        <div className="eyebrow">WELCOME TO MORRI</div>
        <h1>
          พื้นที่จัดการคิวของคุณ
          <br />
          พร้อมเริ่มต้นแล้ว
        </h1>
        <p>เชื่อมฐานข้อมูลและเพิ่มแอดมินก่อนใช้งานจริง</p>
        <ol className="setup-steps">
          <li>
            <Check size={18} />
            <div>
              <strong>สร้างโปรเจกต์ Supabase</strong>
              <p>รันไฟล์ migration ในโฟลเดอร์ supabase/migrations</p>
            </div>
          </li>
          <li>
            <Check size={18} />
            <div>
              <strong>ตั้งค่าการเชื่อมต่อ</strong>
              <p>
                คัดลอก .env.example เป็น .env.local แล้วกรอก URL และ publishable
                key
              </p>
            </div>
          </li>
          <li>
            <Check size={18} />
            <div>
              <strong>ตั้งบัญชีแอดมินหลัก</strong>
              <p>
                ตั้งเจ้าของระบบตาม README
                จากนั้นล็อกอินเพื่อเพิ่มแอดมินคนอื่นผ่านเมนูจัดการแอดมิน
              </p>
            </div>
          </li>
        </ol>
        {process.env.MQS_DEMO_MODE === "true" && (
          <Link className="button primary" href="/demo">
            ดูตัวอย่างหน้าจอ <ArrowRight size={18} />
          </Link>
        )}
        <Link className="button secondary" href="/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
        <p className="help">รายละเอียดการตั้งค่าและ deploy อยู่ใน README.md</p>
      </section>
    </main>
  );
}
