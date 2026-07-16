import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getNotificationFeed, getNotificationStats, getChannelHealth, getDeadLetterCount } from "@/lib/notifications/opsEngine";
import { OpsFilters, OpsFeed, OpsTester, MarkAllRead, OpsVerifier } from "@/components/admin/OpsNotificationFeed";
import { OpsLiveFeed } from "@/components/admin/OpsLiveFeed";
import { TEST_PRESETS, CHANNEL_ICON, type OpsChannelKey } from "@/config/notifications";

/** Notification Operations Center — the live command view for the multi-channel engine. */
export const metadata: Metadata = { title: "Notification Ops", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = { healthy: "Healthy", degraded: "Degraded", failing: "Failing", pending: "Pending", dormant: "Dormant" };
const CHANNEL_LABEL: Record<string, string> = { in_app: "In-App", email: "Email", slack: "Slack", sms: "SMS", whatsapp: "WhatsApp", push: "Push" };
const ms = (n: number | null) => (n == null ? "—" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} sec`);
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  return m < 1 ? "just now" : m < 60 ? `${Math.floor(m)}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};

export default async function NotificationOpsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const sp = await searchParams;

  const [stats, feed, channels, dlqCount] = await Promise.all([
    getNotificationStats(),
    getNotificationFeed({
      category: sp.category || undefined, severity: sp.severity || undefined, status: sp.status || undefined,
      q: sp.q || undefined, unread: sp.unread === "1", dlq: sp.dlq === "1",
      cursor: sp.cursor || null, limit: 25,
    }),
    getChannelHealth(),
    getDeadLetterCount(),
  ]);
  const nextHref = () => { const u = new URLSearchParams(sp as Record<string, string>); if (feed.nextCursor) u.set("cursor", feed.nextCursor); return `?${u.toString()}`; };
  const firstHref = () => { const u = new URLSearchParams(sp as Record<string, string>); u.delete("cursor"); const s = u.toString(); return s ? `?${s}` : "?"; };

  return (
    <main className="admin">
      <header className="admin__head cc-head">
        <div>
          <p className="admin__eyebrow">Operations · Notifications</p>
          <h1 className="admin__title">Notification Operations Center</h1>
          <p className="admin__count">Every operational notification, every channel — delivery, failures and retries in one place.</p>
        </div>
        <div className="inc-subnav">
          <OpsLiveFeed />
          <MarkAllRead unread={stats.unread} />
          <Link href="/admin/notification-analytics" className="op-item__btn">📊 Analytics</Link>
          <Link href="/admin/incidents" className="op-item__btn">🚨 Incidents</Link>
        </div>
      </header>

      {/* Top cards — volume + notifier health */}
      <div className="inc-kpis">
        <div className="inc-kpi"><span className="inc-kpi__v">{stats.today}</span><span className="inc-kpi__k">Notifications today</span></div>
        <div className={`inc-kpi${stats.criticalToday ? " inc-kpi--alert" : ""}`}><span className="inc-kpi__v">{stats.criticalToday}</span><span className="inc-kpi__k">Critical alerts</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{stats.deliveryRate == null ? "—" : `${stats.deliveryRate}%`}</span><span className="inc-kpi__k">Delivery rate</span></div>
        <div className={`inc-kpi${stats.failed ? " inc-kpi--alert" : ""}`}><span className="inc-kpi__v">{stats.failed}</span><span className="inc-kpi__k">Failed today</span></div>
        <div className="inc-kpi"><span className="inc-kpi__v">{ms(stats.avgDeliveryMs)}</span><span className="inc-kpi__k">Average delivery</span></div>
        <div className={`inc-kpi${stats.criticalUnacked ? " inc-kpi--alert" : ""}`}><span className="inc-kpi__v">{stats.criticalUnacked}</span><span className="inc-kpi__k">Awaiting acknowledgement</span></div>
      </div>

      {/* Channel health — state + last success/failure + 24h latency */}
      <section className="nlog-channels">
        {channels.map((c) => (
          <div key={c.key} className={`nlog-chealth nlog-chealth--${c.state}`}>
            <span className="nlog-chealth__name">{CHANNEL_ICON[c.key as OpsChannelKey]} {CHANNEL_LABEL[c.key] ?? c.key}</span>
            <span className="nlog-chealth__state">{STATE_LABEL[c.state] ?? c.state}</span>
            {c.configured ? (
              <dl className="nlog-chealth__metrics">
                <div><dt>Last ok</dt><dd>{ago(c.lastSuccessAt)}</dd></div>
                <div><dt>Last fail</dt><dd>{ago(c.lastFailureAt)}</dd></div>
                <div><dt>Latency 24h</dt><dd>{ms(c.avgLatencyMs24h)}</dd></div>
                <div><dt>24h</dt><dd>{c.delivered24h}✓ {c.failed24h}✗</dd></div>
              </dl>
            ) : null}
          </div>
        ))}
      </section>

      {dlqCount > 0 ? (
        <Link href="?dlq=1" className="nlog-dlqbanner">☠ {dlqCount} notification{dlqCount === 1 ? "" : "s"} in the Dead Letter Queue — retries exhausted. Review &amp; replay →</Link>
      ) : null}

      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Send a test</h2>
          <p className="admin__muted" style={{ fontSize: 12, marginBottom: 8 }}>Fire a realistic sample of each event to verify formatting and routing.</p>
          <OpsTester presets={TEST_PRESETS} />
        </section>
        <section className="od-card">
          {process.env.NODE_ENV !== "production" ? (
            <>
              <h2 className="od-card__title">Retry verification <span className="nlog-devtag">dev only</span></h2>
              <p className="admin__muted" style={{ fontSize: 12, marginBottom: 8 }}>Drives the real lifecycle against a real failing provider: sending → retry ×3 (1m/5m/15m) → DLQ → reconnect → replay → delivered. Time is compressed; the backoff logic is untouched.</p>
              <OpsVerifier />
              <hr style={{ border: 0, borderTop: "1px solid var(--ad-hair)", margin: "14px 0" }} />
            </>
          ) : null}
          <h2 className="od-card__title">Retention policy</h2>
          <div className="od-detail">
            <div><dt>Critical / audit</dt><dd>2 years</dd></div>
            <div><dt>Operational</dt><dd>180 days</dd></div>
            <div><dt>Debug / tests</dt><dd>30 days</dd></div>
          </div>
          <p className="admin__muted" style={{ fontSize: 11, marginTop: 8 }}>Each notification is stamped with an expiry on write; a nightly purge (20:00 UTC) deletes expired rows, so the log never grows unbounded.</p>
        </section>
      </div>

      {/* Feed */}
      <section className="od-card">
        <h2 className="od-card__title">{sp.dlq === "1" ? "Dead Letter Queue" : "Feed"}</h2>
        <OpsFilters shown={feed.items.length} dlq={sp.dlq === "1"} />
        <OpsFeed items={feed.items} />
        {(feed.hasMore || sp.cursor) ? (
          <div className="inc-listbar" style={{ marginTop: 12 }}>
            <span className="admin__muted">Showing {feed.items.length}{feed.hasMore ? " · more available" : " · end of results"}</span>
            <span className="inc-listbar__right">
              {sp.cursor ? <Link className="op-item__btn" href={firstHref()}>⇤ Newest</Link> : null}
              {feed.hasMore ? <Link className="op-item__btn" href={nextHref()}>Older →</Link> : null}
            </span>
          </div>
        ) : null}
      </section>
    </main>
  );
}
