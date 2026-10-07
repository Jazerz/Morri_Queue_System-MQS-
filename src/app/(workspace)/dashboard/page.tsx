import { requireAdmin } from "@/lib/auth";
import { DashboardView } from "@/components/dashboard-view";
export default async function DashboardPage() {
  await requireAdmin();
  return <DashboardView />;
}
