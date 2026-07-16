import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getNotificationAnalytics, getDeadLetterCount } from "@/lib/notifications/opsEngine";
import { CHANNEL_ICON, EVENT_CATEGORY, type OpsChannelKey, type OpsEvent } from "@/config/notifications";

/** Notification Analytics — how the NOTIFIER itself is performing. Every number derives from
 *  notification_log rows in the window; nothing is estimated. */
export const metadata: Metadata = { title: "Notification Analytics", robots: { index: false } };
export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = { in_app: "In-App", email: "Email", slack: "Slack", sms: "SMS", whatsapp: "WhatsApp", push: "Push" };
const ms = (n: number | null) => (n == null ? "—" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(2)} s`);
const dur = (m: number | null) => (m == null ? "—" : m < 1 ? "<1 min" : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`);
const day = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export default async function NotificationAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const includeTests = sp.tests === "1";

  const [a, dlq] = await Promise.all([getNotificationAnalytics(days, includeTests), getDeadLetterCount()]);
  const maxDaily = Math.max(1, ...a.daily.map((d) => d.total));
  const maxEvent = Math.max(1, ...a.topEvents.map((e) => e.count));
  const maxFail = Math.max(1, ...a.topFailures.map((f) => f.count));
  const qs = (o: Record<string, string>) => { const u = new URLSearchParams({ ...(sp as Record<string, string>), ...o }); return `?${u.toString()}`; };

  return (
    <main className="admin">
      <header className="admin__head cc-head">
        <div>
          <p className="admin__eyebrow">Operations · Notifications</p>
          <h1 className="admin__title">Notification Analytics</h1>
          <p className="admin__count">Delivery health of the notification engine itself — last {a.windowDays} days.</p>
        </div>
        <nav className="inc-subnav">
          <Link href="/admin/notifications-log" className="op-item__btn">← Ops Center</Link>
          {[7, 30, 90].map((d) => <Link key={d} href={qs({ days: String(d) })} className={`op-item__btn${d === a.windowDays ? " is-active" : ""}`}>{d}d</Link>)}
          <Link href={qs({ tests: includeTests ? "0" : "1" })} className={`op-item__btn${includeTests ? " is-active" : ""}`}>{includeTests ? "Tests included" : "Tests excluded"}</Link>
        </nav>
      </header>

      {/* Headline KPIs */}
      <div className="inc-kpis">
        <div className="inc-kpi"><span className="inc-kpi__v">{a.deliveryRate == null ? "—" : `${a.deliveryRate}%`}</span><span className="inc-kpi__k">Delivery rate</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{a.events}</span><span className="inc-kpi__k">Events ({a.dispatches} dispatches)</span></div>
        <div className={`inc-kpi${a.failed ? " inc-kpi--alert" : ""}`}><span className="inc-kpi__v">{a.failed}</span><span className="inc-kpi__k">Failures</span></div>
        <div className={`inc-kpi${dlq ? " inc-kpi--alert" : ""}`}><span className="inc-kpi__v">{dlq}</span><span className="inc-kpi__k">In dead letter queue</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{a.retries}</span><span className="inc-kpi__k">Retries ({a.windowDays}d)</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{a.replaySuccessRate == null ? "—" : `${a.replaySuccessRate}%`}</span><span className="inc-kpi__k">Replay success ({a.replaySucceeded}/{a.replayAttempts})</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{dur(a.mttaMin)}</span><span className="inc-kpi__k">MTTA — mean time to acknowledge</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{dur(a.mttrMin)}</span><span className="inc-kpi__k">MTTR — mean time to recover</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{a.suppressed}</span><span className="inc-kpi__k">Noise suppressed (deduped)</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{a.queued}</span><span className="inc-kpi__k">Queued (rate limited)</span></div>
      </div>

      <div className="od-grid">
        {/* Per-channel performance — the Slack/Email/SMS latency ask */}
        <section className="od-card">
          <h2 className="od-card__title">Channel performance</h2>
          {a.byChannel.length ? (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead><tr><th>Channel</th><th>Sent</th><th>Failed</th><th>DLQ</th><th>Delivery</th><th>Avg</th><th>p50</th><th>p95</th><th>7d</th><th>30d</th><th>90d</th></tr></thead>
                <tbody>
                  {a.byChannel.map((c) => (
                    <tr key={c.channel}>
                      <td>{CHANNEL_ICON[c.channel as OpsChannelKey] ?? "•"} {CHANNEL_LABEL[c.channel] ?? c.channel}</td>
                      <td className="admin__mono">{c.delivered}</td>
                      <td className={`admin__mono${c.failed ? " nlog-neg" : ""}`}>{c.failed}</td>
                      <td className={`admin__mono${c.dead ? " nlog-neg" : ""}`}>{c.dead}</td>
                      <td className="admin__mono">{c.deliveryRate == null ? "—" : `${c.deliveryRate}%`}</td>
                      <td className="admin__mono">{ms(c.avgMs)}</td>
                      <td className="admin__mono">{ms(c.p50Ms)}</td>
                      <td className="admin__mono">{ms(c.p95Ms)}</td>
                      <td className="admin__mono">{c.uptime7 == null ? "—" : `${c.uptime7}%`}</td>
                      <td className="admin__mono">{c.uptime30 == null ? "—" : `${c.uptime30}%`}</td>
                      <td className="admin__mono">{c.uptime90 == null ? "—" : `${c.uptime90}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="admin__muted">No dispatches in window.</p>}
          <p className="admin__muted" style={{ fontSize: 11, marginTop: 6 }}>Latency is the measured provider round-trip; p95 is the number to watch — an average hides the slow tail. Uptime = delivery success over the trailing period (dormant/queued excluded — a throttled channel isn&apos;t down).</p>
        </section>

        {/* Response */}
        <section className="od-card">
          <h2 className="od-card__title">Response</h2>
          <div className="od-detail">
            <div><dt>Critical alerts</dt><dd>{a.criticalTotal}</dd></div>
            <div><dt>Acknowledged</dt><dd>{a.criticalAcked}{a.criticalTotal ? ` of ${a.criticalTotal} (${Math.round((a.criticalAcked / a.criticalTotal) * 100)}%)` : ""}</dd></div>
            <div><dt>MTTA</dt><dd>{dur(a.mttaMin)}</dd></div>
            <div><dt>Mean time to read</dt><dd>{dur(a.timeToReadMin)}</dd></div>
            <div><dt>MTTR (recovered dispatches)</dt><dd>{dur(a.mttrMin)}</dd></div>
            <div><dt>Skipped (channel dormant)</dt><dd>{a.skipped}</dd></div>
          </div>
          <p className="admin__muted" style={{ fontSize: 11, marginTop: 6 }}>MTTA = acknowledged − created (critical). MTTR = the time a failing dispatch took to finally deliver after retries. Skipped means a dormant channel, not a failure.</p>
        </section>
      </div>

      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Top notification types</h2>
          {a.topEvents.length ? (
            <ul className="inc-bars">
              {a.topEvents.map((e) => (
                <li key={e.key} className="inc-bars__row">
                  <span className="inc-bars__label" title={e.key}>{e.key}<span className="nlog-cat" style={{ marginLeft: 6 }}>{EVENT_CATEGORY[e.key as OpsEvent] ?? "—"}</span></span>
                  <span className="inc-bars__track"><span className="inc-bars__fill" style={{ width: `${(e.count / maxEvent) * 100}%` }} /></span>
                  <span className="inc-bars__n">{e.count}{e.failed ? <span className="nlog-neg"> ({e.failed}✗)</span> : null}</span>
                </li>
              ))}
            </ul>
          ) : <p className="admin__muted">No events in window.</p>}
        </section>

        <section className="od-card">
          <h2 className="od-card__title">Top failure reasons</h2>
          {a.topFailures.length ? (
            <ul className="inc-bars">
              {a.topFailures.map((f) => (
                <li key={f.key} className="inc-bars__row">
                  <span className="inc-bars__label" title={f.key}>{f.key}</span>
                  <span className="inc-bars__track"><span className="inc-bars__fill inc-bars__fill--alt" style={{ width: `${(f.count / maxFail) * 100}%` }} /></span>
                  <span className="inc-bars__n">{f.count}</span>
                </li>
              ))}
            </ul>
          ) : <p className="admin__muted">🟢 No failures in window.</p>}
          <p className="admin__muted" style={{ fontSize: 11, marginTop: 6 }}>Provider errors are grouped by their signature (e.g. <span className="admin__mono">resend 422</span>) so a recurring fault is obvious.</p>
        </section>
      </div>

      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Top noisy alerts (deduped)</h2>
          {a.topNoisy.length ? (
            <ul className="inc-bars">
              {a.topNoisy.map((n) => {
                const max = Math.max(1, ...a.topNoisy.map((x) => x.occurrences));
                return (
                  <li key={n.key} className="inc-bars__row">
                    <span className="inc-bars__label" title={n.key}>{n.event}{n.entityRef ? <span className="admin__muted"> · {n.entityRef}</span> : null}</span>
                    <span className="inc-bars__track"><span className="inc-bars__fill inc-bars__fill--alt" style={{ width: `${(n.occurrences / max) * 100}%` }} /></span>
                    <span className="inc-bars__n">↻{n.occurrences}</span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="admin__muted">🟢 No repeated alerts — nothing is being suppressed.</p>}
          <p className="admin__muted" style={{ fontSize: 11, marginTop: 6 }}>Identical repeats within {5} min collapse onto one dispatch. These are your loudest signatures — candidates for a suppression rule or a real fix.</p>
        </section>

        <section className="od-card">
          <h2 className="od-card__title">Failure rate by category</h2>
          {a.byCategory.length ? (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead><tr><th>Category</th><th>Total</th><th>Failed</th><th>Failure rate</th></tr></thead>
                <tbody>
                  {a.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td>
                      <td className="admin__mono">{c.total}</td>
                      <td className={`admin__mono${c.failed ? " nlog-neg" : ""}`}>{c.failed}</td>
                      <td className={`admin__mono${c.failureRate ? " nlog-neg" : ""}`}>{c.failureRate == null ? "—" : `${c.failureRate}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="admin__muted">No data.</p>}
        </section>
      </div>

      <section className="od-card">
        <h2 className="od-card__title">Hourly distribution</h2>
        <div className="inc-trend">
          {a.hourly.map((h) => {
            const maxH = Math.max(1, ...a.hourly.map((x) => x.count));
            return (
              <div key={h.hour} className="inc-trend__col" title={`${String(h.hour).padStart(2, "0")}:00 — ${h.count} dispatches`}>
                <span className="inc-trend__bars"><span className="inc-trend__bar inc-trend__bar--opened" style={{ height: `${(h.count / maxH) * 100}%` }} /></span>
                <span className="inc-trend__m">{String(h.hour).padStart(2, "0")}</span>
              </div>
            );
          })}
        </div>
        <p className="admin__muted" style={{ fontSize: 11, marginTop: 6 }}>When notifications actually fire (server local time) — useful for spotting a noisy cron or a nightly batch.</p>
      </section>

      <section className="od-card">
        <h2 className="od-card__title">Daily volume</h2>
        {a.daily.length ? (
          <>
            <div className="inc-trend">
              {a.daily.map((d) => (
                <div key={d.day} className="inc-trend__col" title={`${d.day}: ${d.total} dispatches, ${d.delivered} delivered, ${d.failed} failed`}>
                  <span className="inc-trend__bars">
                    <span className="inc-trend__bar inc-trend__bar--resolved" style={{ height: `${(d.delivered / maxDaily) * 100}%` }} />
                    {d.failed ? <span className="inc-trend__bar nlog-trend__bar--failed" style={{ height: `${(d.failed / maxDaily) * 100}%` }} /> : null}
                  </span>
                  <span className="inc-trend__m">{day(d.day)}</span>
                </div>
              ))}
            </div>
            <p className="admin__muted" style={{ marginTop: 8, fontSize: 12 }}><span className="inc-trend__key inc-trend__key--resolved" /> Delivered &nbsp; <span className="inc-trend__key nlog-trend__key--failed" /> Failed</p>
          </>
        ) : <p className="admin__muted">No data yet.</p>}
      </section>
    </main>
  );
}
