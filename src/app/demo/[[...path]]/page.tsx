import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { CalendarView } from "@/components/calendar-view";
import { CatalogView } from "@/components/catalog-view";
import { DashboardView } from "@/components/dashboard-view";
import { ExportView } from "@/components/export-view";
import { AdminsView } from "@/components/admins-view";
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
    case "admins":
      content = (
        <AdminsView
          demo
          members={[
            {
              user_id: "demo-owner",
              display_name: "Morii Owner",
              email: "owner@example.com",
              active: true,
              role: "owner",
            },
            {
              user_id: "demo-admin",
              display_name: "ทีมดูแลคิว",
              email: "team@example.com",
              active: true,
              role: "admin",
            },
          ]}
        />
      );
      break;
    default:
      notFound();
  }
  return (
    <Shell name="Morii Owner" demo isOwner>
      {content}
    </Shell>
  );
}
