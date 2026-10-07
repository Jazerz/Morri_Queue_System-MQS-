import { redirect } from "next/navigation";
import { requireAdmin, AccessError } from "@/lib/auth";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let name = "";
  let isOwner = false;
  try {
    const admin = await requireAdmin();
    name = admin.displayName;
    isOwner = admin.isOwner;
  } catch (e) {
    if (e instanceof AccessError) {
      if (e.status === 503) redirect("/setup");
      redirect(e.status === 403 ? "/login?denied=1" : "/login");
    }
    throw e;
  }
  return (
    <Shell name={name} isOwner={isOwner}>
      {children}
    </Shell>
  );
}
