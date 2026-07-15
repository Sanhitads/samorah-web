import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getNotificationLog, channelStatus } from "@/lib/notifications/opsEngine";
import { NotificationTester } from "@/components/admin/NotificationTester";

/** Operational notification feed (In-app channel) + channel status + test tool (Phase 5). */
export const metadata: Metadata = { title: "Notification Log", robots: { index: false } };
export const dynamic = "force-dynamic";

const SEV: Record<string, string> = { info: "🟢", warning: "🟡", critical: "🔴" };
const ST: Record<string, string> = { sent: "✓ sent", failed: "✗ failed", skipped: "– skipped" };
const dt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function NotificationLogPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const [rows, status] = await Promise.all([getNotificationLog({ limit: 150 }), Promise.resolve(channelStatus())]);

  return (
    <main className="admin">
      <header className="admin__head cc-head">
        <div>
          <p className="admin__eyebrow">Operations · Notifications</p>
          <h1 className="admin__title">Notification log</h1>
          <p className="admin__count">Every operational notification, across all channels. In-app is the always-on dashboard feed.</p>
        </div>
      </header>

      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Channels</h2>
          <ul className="nt__channels">
            {status.map((s) => (
              <li key={s.key} className="nt__channel"><span>{s.key}</span><span className={s.configured ? "nt__live" : "nt__dormant"}>{s.configured ? "● live" : "○ dormant"}</span></li>
            ))}
          </ul>
          <p className="admin__muted" style={{ fontSize: 11, marginTop: 6 }}>Dormant channels are cleanly skipped — set their env vars to activate (plug-and-play).</p>
        </section>
        <section className="od-card">
          <h2 className="od-card__title">Send a test</h2>
          <NotificationTester />
        </section>
      </div>

      <section className="od-card">
        <h2 className="od-card__title">Recent notifications ({rows.length})</h2>
        {rows.length ? (
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead><tr><th>When</th><th>Event</th><th>Title</th><th>Channel</th><th>Sev</th><th>Status</th><th>Target</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="admin__muted">{dt(r.createdAt)}</td>
                    <td className="admin__mono" style={{ fontSize: 12 }}>{r.event}</td>
                    <td>{r.title ?? "—"}{r.entityRef ? <span className="admin__muted"> · {r.entityRef}</span> : null}</td>
                    <td>{r.channel}</td>
                    <td>{SEV[r.severity] ?? ""}</td>
                    <td className={`nt__st nt__st--${r.status}`}>{ST[r.status] ?? r.status}{r.error ? <span className="admin__muted" style={{ fontSize: 11 }}> · {r.error}</span> : null}</td>
                    <td className="admin__muted">{r.target ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-alerts"><span className="no-alerts__check">✓</span><p className="no-alerts__title">No notifications yet</p><p className="no-alerts__sub">Operational events (orders, low stock, payment failures, incident escalations, the daily report) will appear here.</p></div>
        )}
      </section>

      <p className="admin__muted" style={{ marginTop: 12, fontSize: 12 }}><Link href="/admin/incidents" className="text-link">← Incidents</Link></p>
    </main>
  );
}
