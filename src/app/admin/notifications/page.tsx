import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getNotificationCenter, getNotificationMetrics } from "@/services/notificationCenterService";
import { NotificationCenter } from "@/components/admin/NotificationCenter";

/** Notification center — `/admin/notifications`. Two classes (operational derived + events
 *  recorded) with filters, search, Open/History tabs, live updates, and workflow state. R6. */
export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const [{ operational, events, resolved, unreadEvents }, metrics] = await Promise.all([getNotificationCenter(), getNotificationMetrics()]);
  const openOps = operational.length;

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Notifications</h1>
        <p className="admin__count">{openOps ? `${openOps} operational alert${openOps === 1 ? "" : "s"} open` : "All clear — nothing operational needs attention"}{unreadEvents ? ` · ${unreadEvents} unread event${unreadEvents === 1 ? "" : "s"}` : ""}</p>
      </header>

      {/* At-a-glance metrics (review point 14) */}
      <div className="ash-metrics__row" style={{ marginBottom: 16 }}>
        <div className="ash-metric"><span className="ash-metric__v">{metrics.openOps}</span><span className="ash-metric__l">Open alerts</span></div>
        <div className="ash-metric"><span className="ash-metric__v" data-tone={metrics.critical ? "warn" : "plain"}>{metrics.critical}</span><span className="ash-metric__l">Critical items</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{metrics.unreadEvents}</span><span className="ash-metric__l">Unread events</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{metrics.resolvedToday}</span><span className="ash-metric__l">Resolved today</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{metrics.avgResolutionMin == null ? "—" : `${metrics.avgResolutionMin}m`}</span><span className="ash-metric__l">Avg resolution</span></div>
      </div>

      <NotificationCenter operational={operational} events={events} resolved={resolved} />
    </main>
  );
}
