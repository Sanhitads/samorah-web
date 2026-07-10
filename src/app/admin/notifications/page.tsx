import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getAdminAlerts } from "@/services/notificationCenterService";

/** Notification center — `/admin/notifications`. Live, derived admin alerts (R6). */
export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

const DOT: Record<string, string> = { critical: "🔴", warn: "🟡", info: "🔵" };

export default async function NotificationsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const alerts = await getAdminAlerts();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Notifications</h1>
        <p className="admin__count">{alerts.length ? `${alerts.length} thing${alerts.length === 1 ? "" : "s"} need attention` : "All clear — nothing needs attention"}</p>
      </header>

      {alerts.length ? (
        <ul className="health-list">
          {alerts.map((a) => (
            <li key={a.key} className="health-item" data-s={a.severity === "critical" ? "down" : a.severity === "warn" ? "warn" : "ok"}>
              <span className="health-item__dot">{DOT[a.severity]}</span>
              <span className="health-item__name">{a.title}</span>
              <span className="health-item__detail admin__mono">{a.count}</span>
              <Link href={a.href} className="text-link">Review →</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin__empty">Nothing needs your attention right now.</p>
      )}
    </main>
  );
}
