import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getNotificationCenter } from "@/services/notificationCenterService";
import { NotificationEvents } from "@/components/admin/NotificationEvents";

/** Notification center — `/admin/notifications`. Two classes: operational (derived) + events (recorded). R6. */
export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

const DOT: Record<string, string> = { critical: "🔴", warn: "🟡", info: "🔵" };

export default async function NotificationsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { operational, events, unreadEvents } = await getNotificationCenter();
  const total = operational.length + unreadEvents;

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Notifications</h1>
        <p className="admin__count">{total ? `${total} thing${total === 1 ? "" : "s"} need attention` : "All clear — nothing needs attention"}</p>
      </header>

      {/* Class 1 — operational (derived, self-clearing) */}
      <section className="ash-metrics">
        <div className="ash-activity__head"><h2 className="ash-jump__title">Operational</h2><span className="admin__muted">live conditions · clear themselves when resolved</span></div>
        {operational.length ? (
          <ul className="health-list">
            {operational.map((a) => (
              <li key={a.key} className="health-item" data-s={a.severity === "critical" ? "down" : a.severity === "warn" ? "warn" : "ok"}>
                <span className="health-item__dot">{DOT[a.severity]}</span>
                <span className="health-item__name">{a.title}</span>
                <span className="health-item__detail admin__mono">{a.count}</span>
                <Link href={a.href} className="text-link">Review →</Link>
              </li>
            ))}
          </ul>
        ) : <p className="admin__muted">Nothing operational needs attention right now.</p>}
      </section>

      {/* Class 2 — event notifications (recorded, dismissable) */}
      <section className="ash-metrics">
        <div className="ash-activity__head"><h2 className="ash-jump__title">Events</h2><span className="admin__muted">one-time events · read/dismiss</span></div>
        <NotificationEvents events={events} />
      </section>
    </main>
  );
}
