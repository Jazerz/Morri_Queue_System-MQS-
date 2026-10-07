"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  Download,
  SlidersHorizontal,
  LogOut,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { signOut } from "@/app/actions";
const navigation = [
  { href: "/", label: "ปฏิทินคิว", icon: CalendarDays },
  { href: "/inventory", label: "กล้องและอุปกรณ์", icon: Camera },
  { href: "/dashboard", label: "ภาพรวมการเช่า", icon: ChartNoAxesCombined },
  { href: "/export", label: "ส่งออกข้อมูล", icon: Download },
  { href: "/settings", label: "ตั้งค่าการจัดส่ง", icon: SlidersHorizontal },
];
export function Shell({
  children,
  name,
  demo = false,
  isOwner = false,
}: {
  children: ReactNode;
  name: string;
  demo?: boolean;
  isOwner?: boolean;
}) {
  const path = usePathname(),
    router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href={demo ? "/demo" : "/"} className="brand">
          <span className="brand-icon">
            <Camera size={25} />
          </span>
          <span>
            morri<span className="brand-dot">.</span>
            <small>QUEUE SYSTEM</small>
          </span>
        </Link>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {[
            ...navigation,
            ...(isOwner
              ? [{ href: "/admins", label: "จัดการแอดมิน", icon: ShieldCheck }]
              : []),
          ].map((n) => {
            const href = demo ? `/demo${n.href === "/" ? "" : n.href}` : n.href;
            return (
              <Link
                key={n.href}
                href={href}
                className={`nav-link ${path === href ? "active" : ""}`}
              >
                <n.icon size={19} />
                <span>{n.label}</span>
                {path === href && <span className="nav-dot" />}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={20} />
            <strong>ทุกคิว เป็นระเบียบ</strong>
            <p>
              พื้นที่เล็ก ๆ สำหรับดูแล
              <br />
              กล้องและความทรงจำดี ๆ
            </p>
          </div>
          <div className="user-card">
            <span className="avatar">{name.slice(0, 1)}</span>
            <span>
              <strong>{name}</strong>
              <small>
                {demo ? "พื้นที่ตัวอย่าง" : isOwner ? "แอดมินหลัก" : "แอดมิน"}
              </small>
            </span>
            {!demo && (
              <form action={signOut}>
                <button
                  className="icon-button"
                  title="ออกจากระบบ"
                  aria-label="ออกจากระบบ"
                >
                  <LogOut size={17} />
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span className="breadcrumb">
            พื้นที่ทำงาน <span>/</span> <b>Morri Queue System</b>
          </span>
          <span className="workspace-badge">
            <span />
            {demo ? "ข้อมูลตัวอย่าง" : "สำหรับแอดมิน"}
          </span>
          {!demo && (
            <form action={signOut} className="mobile-signout">
              <button className="icon-button" aria-label="ออกจากระบบ">
                <LogOut size={18} />
              </button>
            </form>
          )}
        </header>
        {demo && (
          <div className="demo-banner">
            กำลังดูข้อมูลจำลอง • ทดลองเปิดฟอร์มและตัวกรองได้ แต่ไม่บันทึกข้อมูล{" "}
            <Link href="/login">
              เข้าสู่ระบบแอดมิน <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <main className="main-content">{children}</main>
        <footer className="app-footer">
          <span>MORRI QUEUE SYSTEM</span>
          <span>จัดการทุกคิว ด้วยความใส่ใจ</span>
        </footer>
      </div>
    </div>
  );
}
