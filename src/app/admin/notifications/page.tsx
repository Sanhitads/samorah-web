import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getNotificationCenter } from "@/services/notificationCenterService";
import { NotificationCenter } from "@/components/admin/NotificationCenter";

/** Notification center — `/admin/notifications`. Two classes (operational derived + events
 *  recorded) with filters, search, Open/History tabs, live updates, and workflow state. R6. */
export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { operational, events, resolved, unreadEvents } = await getNotificationCenter();
  const openOps = operational.length;

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Notifications</h1>
        <p className="admin__count">{openOps ? `${openOps} operational alert${openOps === 1 ? "" : "s"} open` : "All clear — nothing operational needs attention"}{unreadEvents ? ` · ${unreadEvents} unread event${unreadEvents === 1 ? "" : "s"}` : ""}</p>
      </header>

      <NotificationCenter operational={operational} events={events} resolved={resolved} />
    </main>
  );
}
