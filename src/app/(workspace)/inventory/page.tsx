import { requireAdmin } from "@/lib/auth";
import { getCatalog } from "@/lib/data";
import { CatalogView } from "@/components/catalog-view";
export default async function InventoryPage() {
  const { db } = await requireAdmin();
  return <CatalogView catalog={await getCatalog(db)} />;
}
