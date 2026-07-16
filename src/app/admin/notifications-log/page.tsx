import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getNotificationFeed, getNotificationStats, channelStatus } from "@/lib/notifications/opsEngine";
import { OpsFilters, OpsFeed, OpsTester, MarkAllRead } from "@/components/admin/OpsNotificationFeed";
import { TEST_PRESETS } from "@/config/notifications";

/** Notification Operations Center — the live command view for the multi-channel engine. */
export const metadata: Metadata = { title: "Notification Ops", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Channel health wording: live → Healthy; WhatsApp is Pending (awaiting its number), others Dormant. */
function health(key: string, configured: boolean): { label: string; state: "healthy" | "pending" | "dormant" } {
  if (configured) return { label: "Healthy", state: "healthy" };
  if (key === "whatsapp") return { label: "Pending", state: "pending" };
  return { label: "Dormant", state: "dormant" };
}
const CHANNEL_LABEL: Record<string, string> = { in_app: "In-App", email: "Email", slack: "Slack", sms: "SMS", whatsapp: "WhatsApp", push: "Push" };
const ms = (n: number | null) => (n == null ? "—" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} sec`);

export default async function NotificationOpsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const sp = await searchParams;

  const [stats, feed] = await Promise.all([
    getNotificationStats(),
    getNotificationFeed({
      category: sp.category || undefined, severity: sp.severity || undefined, status: sp.status || undefined,
      q: sp.q || undefined, unread: sp.unread === "1", page: sp.page ? Number(sp.page) : 1, pageSize: 25,
    }),
  ]);
  const channels = channelStatus();
  const pages = Math.max(1, Math.ceil(feed.total / feed.pageSize));
  const qs = (p: number) => { const u = new URLSearchParams(sp as Record<string, string>); u.set("page", String(p)); return `?${u.toString()}`; };

  return (
    <main className="admin">
      <header className="admin__head cc-head">
        <div>
          <p className="admin__eyebrow">Operations · Notifications</p>
          <h1 className="admin__title">Notification Operations Center</h1>
          <p className="admin__count">Every operational notification, every channel — delivery, failures and retries in one place.</p>
        </div>
        <div className="inc-subnav">
          <MarkAllRead unread={stats.unread} />
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

      {/* Channel health */}
      <section className="nlog-channels">
        {channels.map((c) => {
          const h = health(c.key, c.configured);
          return (
            <div key={c.key} className={`nlog-chealth nlog-chealth--${h.state}`}>
              <span className="nlog-chealth__name">{CHANNEL_LABEL[c.key] ?? c.key}</span>
              <span className="nlog-chealth__state">{h.label}</span>
            </div>
          );
        })}
      </section>

      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Send a test</h2>
          <p className="admin__muted" style={{ fontSize: 12, marginBottom: 8 }}>Fire a realistic sample of each event to verify formatting and routing.</p>
          <OpsTester presets={TEST_PRESETS} />
        </section>
        <section className="od-card">
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
        <h2 className="od-card__title">Feed</h2>
        <OpsFilters total={feed.total} />
        <OpsFeed items={feed.items} />
        {pages > 1 ? (
          <div className="inc-listbar" style={{ marginTop: 12 }}>
            <span className="admin__muted">Page {feed.page} / {pages}</span>
            <span className="inc-listbar__right">
              {feed.page > 1 ? <Link className="op-item__btn" href={qs(feed.page - 1)}>← Prev</Link> : null}
              {feed.page < pages ? <Link className="op-item__btn" href={qs(feed.page + 1)}>Next →</Link> : null}
            </span>
          </div>
        ) : null}
      </section>
    </main>
  );
}
