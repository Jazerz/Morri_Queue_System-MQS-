import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminsView, type AdminMember } from "@/components/admins-view";

export default async function AdminsPage() {
  const { db, isOwner } = await requireAdmin();
  if (!isOwner) redirect("/");
  const { data, error } = await db.rpc("list_admin_members");
  if (error) throw new Error("ไม่สามารถโหลดรายชื่อแอดมินได้");
  return <AdminsView members={data as AdminMember[]} />;
}
