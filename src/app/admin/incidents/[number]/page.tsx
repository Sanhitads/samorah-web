import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getIncidentByNumber } from "@/services/incidentService";
import { IncidentActions } from "@/components/admin/IncidentControls";

export const metadata: Metadata = { title: "Incident", robots: { index: false } };
export const dynamic = "force-dynamic";

const SEV_ICON: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵", info: "⚪" };
const HIST_LABEL: Record<string, string> = { created: "Incident created", assigned: "Assigned", status_changed: "Status changed", notification_added: "Notification added", notification_resolved: "Notification resolved", resolved: "Incident resolved", note_added: "Note added" };
const dt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function IncidentDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { number } = await params;
  const inc = await getIncidentByNumber(number);
  if (!inc) notFound();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/incidents" className="od-back">← Incidents</Link></p>
        <h1 className="admin__title">{inc.number}</h1>
        <p className="admin__count">
          <span className="inc-sev" data-s={inc.severity}>{SEV_ICON[inc.severity]} {inc.severity}</span>
          <span className="inc-status" data-s={inc.status} style={{ marginLeft: 8 }}>{inc.status}</span>
          <span className="admin__muted"> · {inc.title}</span>
        </p>
      </header>

      {/* Actions */}
      <IncidentActions number={inc.number} status={inc.status} />

      {/* Overview */}
      <section className="od-card" style={{ marginTop: 14 }}>
        <h2 className="od-card__title">Overview</h2>
        <div className="od-detail">
          <div><dt>Category</dt><dd>{inc.categoryLabel}</dd></div>
          <div><dt>Source system</dt><dd>{inc.sourceSystem ?? "—"}</dd></div>
          <div><dt>Root cause</dt><dd>{inc.rootCause ?? "—"}</dd></div>
          <div><dt>Assigned</dt><dd>{inc.assigneeName ?? "Unassigned"}</dd></div>
          <div><dt>Affected orders</dt><dd>{inc.affectedOrders}</dd></div>
          <div><dt>Affected notifications</dt><dd>{inc.affectedNotifications}</dd></div>
          <div><dt>Started</dt><dd>{dt(inc.startedAt)}</dd></div>
          <div><dt>Last activity</dt><dd>{dt(inc.lastActivityAt)}</dd></div>
          <div><dt>Resolved</dt><dd>{inc.resolvedAt ? dt(inc.resolvedAt) : "—"}</dd></div>
        </div>
        {inc.description ? <p className="admin__muted" style={{ marginTop: 10, fontSize: 13 }}>{inc.description}</p> : null}
      </section>

      <div className="od-grid">
        {/* Timeline */}
        <section className="od-card">
          <h2 className="od-card__title">Timeline</h2>
          <ul className="inc-timeline">
            {inc.history.map((h, i) => (
              <li key={i} className="inc-timeline__item">
                <span className="inc-timeline__dot" />
                <span className="inc-timeline__body"><b>{HIST_LABEL[h.event] ?? h.event}</b>{h.detail ? <span className="admin__muted"> — {h.detail}</span> : null}{h.actorName ? <span className="admin__muted"> · {h.actorName}</span> : null}</span>
                <span className="admin__muted inc-timeline__time">{dt(h.createdAt)}</span>
              </li>
            ))}
            {inc.history.length === 0 ? <li className="admin__muted">No events.</li> : null}
          </ul>
        </section>

        {/* Affected orders */}
        <section className="od-card">
          <h2 className="od-card__title">Affected orders ({inc.orders.length})</h2>
          {inc.orders.length ? inc.orders.map((o) => (
            <div key={o} className="od-line"><Link href={`/admin/orders/${o}`} className="admin__mono od-link">{o}</Link></div>
          )) : <p className="admin__muted">No order-linked notifications.</p>}
        </section>
      </div>

      <div className="od-grid">
        {/* Affected notifications */}
        <section className="od-card">
          <h2 className="od-card__title">Affected notifications ({inc.notifications.length})</h2>
          {inc.notifications.map((n, i) => (
            <div key={i} className="od-line">
              <span className="admin__mono" style={{ fontSize: 12 }}>{n.orderNumber ?? n.alertKey}</span>
              <span className="inc-sev" data-s={n.severity ?? "info"}>{n.severity ?? "info"}</span>
              <span className="admin__muted">{n.resolvedAt ? "resolved" : "open"}</span>
            </div>
          ))}
          {inc.notifications.length === 0 ? <p className="admin__muted">None.</p> : null}
        </section>

        {/* Resolution notes + logs */}
        <section className="od-card">
          <h2 className="od-card__title">Resolution notes</h2>
          <p className="admin__muted" style={{ fontSize: 13, minHeight: 20 }}>{inc.resolutionNotes ?? "No resolution notes yet."}</p>
          <h3 className="od-card__title" style={{ marginTop: 14, fontSize: "1rem" }}>System logs</h3>
          <Link href={`/admin/audit?search=${encodeURIComponent(inc.orders[0] ?? inc.category)}`} className="text-link">View related audit logs →</Link>
        </section>
      </div>

      {/* Related incidents */}
      {inc.related.length ? (
        <section className="od-card">
          <h2 className="od-card__title">Related incidents</h2>
          {inc.related.map((r) => (
            <div key={r.number} className="od-line"><Link href={`/admin/incidents/${r.number}`} className="admin__mono od-link">{r.number}</Link><span className="admin__muted">{r.title}</span><span className="inc-status" data-s={r.status}>{r.status}</span></div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
