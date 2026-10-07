import { requireAdmin } from "@/lib/auth";
import { getCatalog } from "@/lib/data";
import { ExportView } from "@/components/export-view";
export default async function ExportPage() {
  const { db } = await requireAdmin();
  return <ExportView catalog={await getCatalog(db)} />;
}
