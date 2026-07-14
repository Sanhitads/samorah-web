import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getNotificationCenter } from "@/services/notificationCenterService";
import { NotificationEvents } from "@/components/admin/NotificationEvents";
import { OperationalAlerts } from "@/components/admin/OperationalAlerts";

/** Notification center — `/admin/notifications`. Two classes: operational (derived, enriched,
 *  self-clearing) + events (recorded, dismissible), plus resolutions from today. R6. */
export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

function resolvedAgo(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3.6e6;
  return h < 1 ? "just now" : `${Math.floor(h)}h ago`;
}

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

      {/* Class 1 — operational (derived, enriched, self-clearing) */}
      <section className="ash-metrics">
        <div className="ash-activity__head"><h2 className="ash-jump__title">Open operational alerts{openOps ? ` (${openOps})` : ""}</h2><span className="admin__muted">live · clear themselves when resolved</span></div>
        <OperationalAlerts alerts={operational} />
      </section>

      {/* Resolved today (from the audit log) — review points 14, 17 */}
      {resolved.length ? (
        <section className="ash-metrics">
          <div className="ash-activity__head"><h2 className="ash-jump__title">Resolved today</h2><span className="admin__muted">{resolved.length}</span></div>
          <ul className="op-resolved">
            {resolved.map((r) => (
              <li key={r.id} className="op-resolved__item">
                <span className="op-resolved__check">✓</span>
                <span>{r.label}{r.orderNumber ? <> · <Link href={`/admin/orders/${r.orderNumber}`} className="admin__mono">{r.orderNumber}</Link></> : null}</span>
                <span className="admin__muted">{resolvedAgo(r.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Class 2 — event notifications (recorded, dismissible) */}
      <section className="ash-metrics">
        <div className="ash-activity__head"><h2 className="ash-jump__title">Recent events</h2><span className="admin__muted">one-time events · read/dismiss</span></div>
        <NotificationEvents events={events} />
      </section>
    </main>
  );
}
