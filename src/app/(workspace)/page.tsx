import { requireAdmin } from "@/lib/auth";
import { getCatalog } from "@/lib/data";
import { CalendarView } from "@/components/calendar-view";
export default async function CalendarPage() {
  const { db } = await requireAdmin();
  return <CalendarView catalog={await getCatalog(db)} />;
}
