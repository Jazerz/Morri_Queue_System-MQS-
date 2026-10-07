import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { CalendarView } from "@/components/calendar-view";
import { CatalogView } from "@/components/catalog-view";
import { DashboardView } from "@/components/dashboard-view";
import { ExportView } from "@/components/export-view";
import { demoCatalog, demoBookings } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default async function DemoPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  if (process.env.MQS_DEMO_MODE !== "true") notFound();
  const { path } = await params;
  const route = path?.join("/") ?? "";
  const bookings = demoBookings();
  let content;
  switch (route) {
    case "":
      content = <CalendarView catalog={demoCatalog} demoBookings={bookings} />;
      break;
    case "inventory":
      content = <CatalogView catalog={demoCatalog} demo />;
      break;
    case "settings":
      content = <CatalogView catalog={demoCatalog} settings demo />;
      break;
    case "dashboard":
      content = <DashboardView demoBookings={bookings} />;
      break;
    case "export":
      content = <ExportView catalog={demoCatalog} demo />;
      break;
    default:
      notFound();
  }
  return (
    <Shell name="Morri Admin" demo>
      {content}
    </Shell>
  );
}
