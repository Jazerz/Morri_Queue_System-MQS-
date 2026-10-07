import { Camera } from "lucide-react";
import { redirect } from "next/navigation";
import { configured } from "@/lib/supabase/server";
import { LoginForm } from "@/components/login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  if (!configured()) redirect("/setup");
  const p = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-icon">
          <Camera size={28} />
        </span>
        <div className="eyebrow">MORRI QUEUE SYSTEM</div>
        <h1>ยินดีต้อนรับกลับมา</h1>
        <p>ทุกกล้อง ทุกคิว ดูแลได้ในที่เดียว</p>
        <LoginForm denied={p.denied === "1"} />
      </section>
      <div className="auth-decoration">made for memories.</div>
    </main>
  );
}
