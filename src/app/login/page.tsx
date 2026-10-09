import { Camera } from "lucide-react";
import Link from "next/link";
import { configured } from "@/lib/supabase/server";
import { LoginForm } from "@/components/login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const ready = configured();
  const p = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-icon">
          <Camera size={28} />
        </span>
        <div className="eyebrow">MORII QUEUE SYSTEM</div>
        <h1>ยินดีต้อนรับกลับมา</h1>
        <p>ทุกกล้อง ทุกคิว ดูแลได้ในที่เดียว</p>
        <LoginForm denied={p.denied === "1"} configured={ready} />
        {!ready && (
          <p className="help">
            ยังไม่ได้เชื่อม Supabase จึงยังล็อกอินจริงไม่ได้{" "}
            <Link href="/setup">ดูวิธีตั้งค่า</Link>
          </p>
        )}
      </section>
      <div className="auth-decoration">made for memories.</div>
    </main>
  );
}
