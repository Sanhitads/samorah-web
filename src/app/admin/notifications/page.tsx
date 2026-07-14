import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getNotificationCenter, getNotificationMetrics, getIncident, getNotificationTrends } from "@/services/notificationCenterService";
import { NotificationCenter } from "@/components/admin/NotificationCenter";

/** Notification center — `/admin/notifications`. Two classes (operational derived + events
 *  recorded) with health header, metrics, incident detection, trends, filters, search,
 *  Open/History tabs, live updates, and workflow state. R6. */
export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

const HEALTH: Record<string, { dot: string; label: string }> = {
  healthy: { dot: "🟢", label: "Healthy" }, attention: { dot: "🟠", label: "Attention" }, critical: { dot: "🔴", label: "Critical" },
};
const staleTone = (m: number | null) => (m == null ? "plain" : m >= 60 ? "warn" : "plain");
const durn = (m: number | null) => (m == null ? "—" : m < 60 ? `${m}m` : `${Math.round((m / 60) * 10) / 10}h`);

export default async function NotificationsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const [{ operational, events, resolved, unreadEvents }, metrics, incident, trends] = await Promise.all([
    getNotificationCenter(), getNotificationMetrics(), getIncident(), getNotificationTrends(),
  ]);
  const openOps = operational.length;
  const h = HEALTH[metrics.status];

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Notifications</h1>
        <p className="admin__count">{openOps ? `${openOps} operational alert${openOps === 1 ? "" : "s"} open` : "All clear — nothing operational needs attention"}{unreadEvents ? ` · ${unreadEvents} unread event${unreadEvents === 1 ? "" : "s"}` : ""}</p>
      </header>

      {/* Incident correlation MVP (point 7) */}
      {incident.active ? (
        <div className="nc-incident" role="alert">
          <span aria-hidden>🔴</span>
          <span><b>{incident.label}</b> — {incident.count} gateway failures in the last {incident.windowMin} min. These likely share one root cause.</span>
        </div>
      ) : null}

      {/* Operational health header (point 8.4) */}
      <section className="nc-health" data-status={metrics.status}>
        <div className="nc-health__status"><span className="nc-health__dot">{h.dot}</span><div><span className="nc-health__label">Operational health · {h.label}</span><span className="nc-health__sub">{metrics.openOps} open · oldest {durn(metrics.oldestUnresolvedMin)}</span></div></div>
        <div className="nc-health__tiers">
          <span className="nc-tier" data-t="critical"><b>{metrics.breakdown.critical}</b> Critical</span>
          <span className="nc-tier" data-t="high"><b>{metrics.breakdown.high}</b> High</span>
          <span className="nc-tier" data-t="medium"><b>{metrics.breakdown.medium}</b> Medium</span>
          <span className="nc-tier" data-t="info"><b>{metrics.breakdown.info}</b> Info</span>
        </div>
      </section>

      {/* At-a-glance metrics (points 6, 14) */}
      <div className="ash-metrics__row" style={{ marginBottom: 12 }}>
        <div className="ash-metric"><span className="ash-metric__v">{metrics.unreadEvents}</span><span className="ash-metric__l">Unread events</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{metrics.resolvedToday}</span><span className="ash-metric__l">Resolved today</span></div>
        <div className="ash-metric"><span className="ash-metric__v" data-tone={staleTone(metrics.oldestUnresolvedMin)}>{durn(metrics.oldestUnresolvedMin)}</span><span className="ash-metric__l">Oldest unresolved</span></div>
        <div className="ash-metric"><span className="ash-metric__v">{durn(metrics.avgResolutionMin)}</span><span className="ash-metric__l">Avg resolution</span></div>
      </div>

      {/* Avg resolution by category (8.5) + trends (8.6) */}
      <div className="od-grid" style={{ marginBottom: 14 }}>
        <div className="od-card">
          <h3 className="od-card__title">Avg resolution by category</h3>
          {metrics.resolutionByCategory.map((c) => (
            <div key={c.category} className="od-line"><span>{c.category}</span><span className="admin__mono">{durn(c.minutes)}</span></div>
          ))}
        </div>
        <div className="od-card">
          <h3 className="od-card__title">Trends <span className="admin__muted">— 30d vs prior 30d</span></h3>
          {trends.map((t) => (
            <div key={t.label} className="od-line">
              <span>{t.label}</span>
              <span className="admin__muted">{t.current} vs {t.prior}</span>
              <span data-tone={t.deltaPct == null ? undefined : t.deltaPct <= 0 ? "up" : "warn"} className="nc-delta">{t.deltaPct == null ? "—" : `${t.deltaPct <= 0 ? "▼" : "▲"} ${Math.abs(t.deltaPct)}%`}</span>
            </div>
          ))}
        </div>
      </div>

      <NotificationCenter operational={operational} events={events} resolved={resolved} />
    </main>
  );
}
