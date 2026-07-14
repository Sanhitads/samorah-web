import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getOperationalMetrics } from "@/services/orderAdminService";
import { getCommandCenter, type Severity, type Urgency } from "@/services/commandCenterService";
import { getRecentAuditEvents } from "@/services/auditService";
import { ActivityFeed, type ActivityItem } from "@/components/admin/ActivityFeed";
import { DashboardPersonalize, type WidgetDef } from "@/components/admin/DashboardPersonalize";

/**
 * Admin Dashboard — `/admin`. Operational command center (v3): business polish over
 * complexity. Business Health glance → seasonal → hero → quick actions → work queue +
 * severity alerts → money → operations → snapshots → inventory → integrations →
 * activity. Luxury-minimal — one sparkline, no chart library. Widgets are personalizable
 * (hide/show per admin, localStorage). Data via the modular commandCenterService.
 */
export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inrK = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`);
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const hrs = (h: number | null) => (h == null ? "—" : h < 24 ? `${h}h` : `${Math.round((h / 24) * 10) / 10}d`);
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Period-over-period badge (review point 3).
function Trend({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="cc-delta cc-delta--flat">—</span>;
  const up = delta >= 0;
  return <span className="cc-delta" data-tone={up ? "up" : "down"}>{up ? "▲" : "▼"} {Math.abs(delta)}%</span>;
}

// ── Activity feed mapping ──
type Cat = ActivityItem["category"];
function categorize(entityType: string, event: string): Cat {
  const e = (entityType || "").toLowerCase();
  const ev = (event || "").toLowerCase();
  if (ev.startsWith("refund.") || ev.startsWith("return.") || e === "refund" || e === "return") return "refund";
  if (e === "order" || e === "shipment" || ev.startsWith("order.") || ev.startsWith("shipment.")) return "order";
  if (e === "product" || e === "variant" || e === "packaging" || ev.includes("stock") || ev.includes("inventory")) return "inventory";
  if (e === "customer" || e === "user" || e === "account" || ev.startsWith("customer.")) return "customer";
  if (e === "settings" || /^(page|navigation|homepage|seo|email|media)/.test(ev)) return "cms";
  return "other";
}
function hrefFor(cat: Cat, orderNumber: string | null): string {
  if (orderNumber) return `/admin/orders/${orderNumber}`;
  switch (cat) {
    case "order": return "/admin/orders";
    case "refund": return "/admin/returns";
    case "inventory": return "/admin/products";
    case "customer": return "/admin/customers";
    case "cms": return "/admin/content";
    default: return "/admin/audit";
  }
}

// External consoles for the Integration Status row (point 10).
const INTEGRATION_CONSOLE: Record<string, string> = {
  ga4: "https://analytics.google.com",
  gtm: "https://tagmanager.google.com",
  clarity: "https://clarity.microsoft.com",
  razorpay: "https://dashboard.razorpay.com",
  shiprocket: "https://app.shiprocket.in",
  resend: "https://resend.com/emails",
  cloudinary: "https://console.cloudinary.com",
};

const SEV_ICON: Record<Severity, string> = { critical: "🔴", warning: "🟠", info: "🔵" };
const SEV_LABEL: Record<Severity, string> = { critical: "Critical", warning: "Warning", info: "Information" };
const URG_META: Record<Urgency, { icon: string; label: string }> = { overdue: { icon: "🔥", label: "Overdue" }, today: { icon: "⚠", label: "Today" }, later: { icon: "🟡", label: "Later" } };

// Widgets the admin can hide/show (review point 15).
const WIDGETS: WidgetDef[] = [
  { key: "health", label: "Business Health" }, { key: "seasonal", label: "Seasonal reminder" },
  { key: "hero", label: "Hero KPIs" }, { key: "quickactions", label: "Quick Actions" },
  { key: "workqueue", label: "Work Queue" }, { key: "alerts", label: "Alerts" },
  { key: "money", label: "Sales & Revenue" }, { key: "operations", label: "Operations & Cash" },
  { key: "snapshots", label: "Customers & Marketing" }, { key: "inventory", label: "Inventory" },
  { key: "integrations", label: "Integration Status" }, { key: "activity", label: "Activity feed" },
];

export default async function AdminDashboard() {
  const staff = await requireStaff("editor");
  const [cc, metrics, activityRaw] = await Promise.all([
    getCommandCenter(), getOperationalMetrics(), getRecentAuditEvents({ limit: 48 }),
  ]);
  const { revenue, inventory, customers, operations, marketing, cashflow, integrations, seasonal, founder, alerts, workQueue, health } = cc;

  const alertsBySev: Record<Severity, typeof alerts> = { critical: [], warning: [], info: [] };
  for (const a of alerts) alertsBySev[a.severity].push(a);

  const activity: ActivityItem[] = activityRaw.map((e) => {
    const cat = categorize(e.entity_type, e.event);
    return { id: e.id, category: cat, label: EVENT_LABEL(e.event), detail: e.notes ?? null, href: hrefFor(cat, e.orderNumber), orderNumber: e.orderNumber, timeAgo: ago(e.created_at) };
  });

  const spark = revenue.trend.spark;
  const sparkMax = Math.max(1, ...spark);
  const sparkPts = spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${30 - (v / sparkMax) * 28}`).join(" ");

  const slaOk = operations.avgFulfillmentHours == null || operations.avgFulfillmentHours <= operations.dispatchSlaTargetHours;
  const PICK_PACK_TARGET_MIN = 5; // warehouse pick/pack target (minutes) — point 7
  const pickPackOk = (metrics.avgPickMinutes == null || metrics.avgPickMinutes <= PICK_PACK_TARGET_MIN) && (metrics.avgPackMinutes == null || metrics.avgPackMinutes <= PICK_PACK_TARGET_MIN);

  return (
    <main className="admin">
      <header className="admin__head cc-head">
        <div>
          <p className="admin__eyebrow">Operations · {staff.role}</p>
          <h1 className="admin__title">Dashboard</h1>
          <p className="admin__count">Everything that needs you today — at a glance.</p>
        </div>
        <DashboardPersonalize widgets={WIDGETS} />
      </header>

      {/* Business Health — one glance (16); View Details → Alerts (point 1) */}
      <section data-widget="health" className="cc-bh" data-status={health.status}>
        <span className="cc-bh__dot" aria-hidden>{health.status === "healthy" ? "🟢" : "🟠"}</span>
        <div className="cc-bh__body">
          <span className="cc-bh__title">Business Health · {health.status === "healthy" ? "Healthy" : "Attention required"}</span>
          <span className="cc-bh__reasons">{health.reasons.length ? health.reasons.join(" · ") : "Stock, payments, dispatch, and content all look good."}</span>
        </div>
        {alerts.length ? <a href="#cc-alerts" className="cc-bh__link">View details →</a> : null}
      </section>

      {/* Seasonal reminder (18) */}
      {seasonal.next ? (
        <Link href="/admin/homepage" data-widget="seasonal" className="cc-season">
          <span className="cc-season__icon" aria-hidden>✦</span>
          <span><b>{seasonal.next.name}</b> in {plural(seasonal.next.daysUntil, "day")}
            {seasonal.homepageDraftUnpublished ? <span className="cc-season__warn"> · homepage draft not published</span> : <span className="admin__muted"> · plan the campaign</span>}
          </span>
        </Link>
      ) : null}

      {/* Hero KPIs (12 + 15) */}
      <section data-widget="hero" className="cc-hero">
        <div className="cc-hero__card">
          <span className="cc-hero__value">{inr(revenue.trend.today)}</span>
          <span className="cc-hero__label">Revenue today</span>
          <span className="cc-hero__sub"><Trend delta={revenue.trend.deltaDay} /> vs yesterday</span>
        </div>
        <Link href="/admin/fulfillment" className="cc-hero__card cc-hero__card--link">
          <span className="cc-hero__value" data-tone="gold">{workQueue.length}</span>
          <span className="cc-hero__label">Tasks in queue</span>
          <span className="cc-hero__sub">{plural(workQueue.filter((w) => w.urgency === "overdue").length, "overdue")}</span>
        </Link>
        <Link href="/admin/returns" className="cc-hero__card cc-hero__card--link">
          <span className="cc-hero__value" data-tone={operations.returnsQueue.toQc ? "warn" : "plain"}>{operations.returnsQueue.open}</span>
          <span className="cc-hero__label">Open returns</span>
          <span className="cc-hero__sub">{operations.returnsQueue.toQc ? `${operations.returnsQueue.toQc} in QC` : "none in QC"}</span>
        </Link>
        <div className="cc-hero__card">
          <span className="cc-hero__value" data-tone={alertsBySev.critical.length ? "warn" : "plain"}>{alerts.length}</span>
          <span className="cc-hero__label">Alerts</span>
          <span className="cc-hero__sub">{alertsBySev.critical.length ? `${alertsBySev.critical.length} critical` : "under control"}</span>
        </div>
      </section>

      {/* Quick Actions — grouped by domain (point 3) */}
      <section data-widget="quickactions" className="cc-qa">
        <div className="cc-qa__group">
          <span className="cc-qa__label">Commerce</span>
          <div className="cc-qa__row">
            <Link href="/admin/products" className="cc-qa__btn cc-qa__btn--primary">+ New Product</Link>
            <Link href="/admin/coupons" className="cc-qa__btn">+ New Discount</Link>
          </div>
        </div>
        <div className="cc-qa__group">
          <span className="cc-qa__label">Content</span>
          <div className="cc-qa__row">
            <Link href="/admin/journal" className="cc-qa__btn">+ New Blog</Link>
            <Link href="/admin/homepage" className="cc-qa__btn">Homepage Draft</Link>
            <Link href="/admin/media" className="cc-qa__btn">Upload Media</Link>
          </div>
        </div>
        <div className="cc-qa__group">
          <span className="cc-qa__label">Marketing</span>
          <div className="cc-qa__row"><Link href="/admin/emails" className="cc-qa__btn">Send Newsletter</Link></div>
        </div>
        <div className="cc-qa__group">
          <span className="cc-qa__label">Logistics</span>
          <div className="cc-qa__row"><Link href="/admin/fulfillment" className="cc-qa__btn">Dispatch Ready</Link></div>
        </div>
      </section>

      {/* Work Queue (11, 16) + Alerts (2) */}
      <div className="cc-grid cc-grid--2">
        <section data-widget="workqueue" className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">My Work Queue</h2><span className="admin__muted">auto-prioritized</span></div>
          {workQueue.length ? (
            <ul className="cc-queue">
              {workQueue.map((q, i) => (
                <li key={i}><Link href={q.href} className="cc-queue__item" data-urg={q.urgency}>
                  <span className="cc-queue__urg" title={URG_META[q.urgency].label}>{URG_META[q.urgency].icon}</span>
                  <span className="cc-queue__label">{q.label}</span><span className="cc-queue__go">→</span>
                </Link></li>
              ))}
            </ul>
          ) : <p className="cc-empty">✦ You're all caught up. Nothing needs action right now.</p>}
        </section>

        <section data-widget="alerts" id="cc-alerts" className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Alerts</h2><span className="admin__muted">{alerts.length}</span></div>
          {alerts.length ? (
            <div className="cc-sev">
              {(["critical", "warning", "info"] as Severity[]).map((sev) => alertsBySev[sev].length ? (
                <div key={sev} className="cc-sev__group">
                  <p className="cc-sev__label"><span aria-hidden>{SEV_ICON[sev]}</span> {SEV_LABEL[sev]}</p>
                  <ul className="cc-alerts">
                    {alertsBySev[sev].map((a, i) => (
                      <li key={i} className="cc-alert">
                        <span className="cc-alert__body"><span className="cc-alert__title">{a.title}</span><span className="cc-alert__detail">{a.detail}</span></span>
                        <Link href={a.href} className="cc-alert__action">{a.action}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null)}
            </div>
          ) : <p className="cc-empty">All clear — no alerts.</p>}
        </section>
      </div>

      {/* Money band: Sales trend (3) + Revenue breakdown (4) */}
      <div data-widget="money" className="cc-grid cc-grid--2">
        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Sales trend</h2><span className="admin__muted">last 14 days</span></div>
          <div className="cc-trend">
            <div className="cc-trend__nums">
              <div className="cc-trend__n"><span className="cc-trend__v">{inr(revenue.trend.today)}</span><span className="cc-trend__l">Today</span></div>
              <div className="cc-trend__n"><span className="cc-trend__v">{inr(revenue.trend.yesterday)}</span><span className="cc-trend__l">Yesterday</span></div>
              <div className="cc-trend__n"><span className="cc-trend__v">{inrK(revenue.trend.last7)}</span><span className="cc-trend__l">7d <Trend delta={revenue.trend.delta7} /></span></div>
              <div className="cc-trend__n"><span className="cc-trend__v">{inrK(revenue.trend.last30)}</span><span className="cc-trend__l">30d <Trend delta={revenue.trend.delta30} /></span></div>
            </div>
            <svg className="cc-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden><polyline points={sparkPts} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" /></svg>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Revenue breakdown</h2><span className="admin__muted">30 days</span></div>
          <ul className="cc-break">
            <li><span>Gross</span><span className="admin__mono">{inr(revenue.breakdown.gross)}</span></li>
            <li><span>Shipping</span><span className="admin__mono">{inr(revenue.breakdown.shipping)}</span></li>
            <li><span>Tax (GST)</span><span className="admin__mono">{inr(revenue.breakdown.tax)}</span></li>
            <li><span>Refunds</span><span className="admin__mono" data-tone={revenue.breakdown.refunds ? "warn" : undefined}>−{inr(revenue.breakdown.refunds)}</span></li>
            <li className="cc-break__net"><span>Net (ex-tax)</span><span className="admin__mono">{inr(revenue.breakdown.net)}</span></li>
          </ul>
        </section>
      </div>

      {/* Operations band: Schedule (5) + Fulfillment/SLA (9) + Cash flow (8) */}
      <div data-widget="operations" className="cc-grid cc-grid--3">
        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Today's schedule</h2></div>
          <ul className="cc-sched">
            <li><Link href="/admin/fulfillment"><b>{queueCountFor(workQueue, "Dispatch")}</b> to dispatch</Link></li>
            <li><Link href="/admin/returns"><b>{operations.returnsQueue.toQc}</b> {operations.returnsQueue.toQc === 1 ? "return" : "returns"} to QC</Link></li>
            <li><Link href="/admin/shipments"><b>{operations.shipmentsAwaitingPickup}</b> awaiting pickup <span className="admin__muted">· time needs Shiprocket</span></Link></li>
          </ul>
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Fulfillment health</h2></div>
          <ul className="cc-health">
            <li className="cc-health__row">
              <span className="cc-health__l">Dispatch SLA</span>
              <span className="cc-health__v" data-tone={slaOk ? "up" : "down"}>{hrs(operations.avgFulfillmentHours)} {operations.avgFulfillmentHours == null ? "" : slaOk ? "✓" : "↑"}</span>
              <span className="cc-health__t admin__muted">target &lt; {operations.dispatchSlaTargetHours}h · confirmed → dispatched</span>
            </li>
            <li className="cc-health__row">
              <span className="cc-health__l">Avg pick / pack</span>
              <span className="cc-health__v" data-tone={pickPackOk ? "up" : "down"}>{metrics.avgPickMinutes == null ? "—" : `${metrics.avgPickMinutes}m`} / {metrics.avgPackMinutes == null ? "—" : `${metrics.avgPackMinutes}m`}</span>
              <span className="cc-health__t admin__muted">target &lt; {PICK_PACK_TARGET_MIN}m each</span>
            </li>
          </ul>
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Cash flow</h2><span className="admin__muted">30 days</span></div>
          <ul className="cc-break">
            <li><span>Received</span><span className="admin__mono">{inr(cashflow.received30)}</span></li>
            <li><span>COD pending</span><span className="admin__mono">{inr(cashflow.pendingCod)}</span></li>
            <li><span>Refunds</span><span className="admin__mono" data-tone={cashflow.refunds30 ? "warn" : undefined}>−{inr(cashflow.refunds30)}</span></li>
            <li className="cc-note"><span className="admin__muted">Settlement dates need Razorpay sync</span></li>
          </ul>
        </section>
      </div>

      {/* Snapshot band: Customers (6) + Marketing/Newsletter (7) + Founder KPIs (13) + AI (14) */}
      <div data-widget="snapshots" className="cc-grid cc-grid--4">
        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Customers</h2><span className="admin__muted">{customers.active30} active 30d</span></div>
          <div className="cc-mini">
            <div><b>{customers.new30}</b><span>New</span></div>
            <div><b>{customers.returning30}</b><span>Returning</span></div>
            <Link href="/admin/customers"><b>{customers.vip}</b><span>VIP</span></Link>
          </div>
          <div className="cc-mini" style={{ marginTop: 6 }}>
            <div><b>{customers.firstTimeBuyers}</b><span>First-time</span></div>
            <div><b>{customers.repeatBuyers}</b><span>Repeat</span></div>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Marketing</h2></div>
          <div className="cc-mini">
            <Link href="/admin/customers"><b>{marketing.newsletter.active}</b><span>Subscribers</span></Link>
            <div><b>+{marketing.newsletter.new7}</b><span>New · 7d</span></div>
          </div>
          {marketing.topCoupon ? (
            <p className="cc-note"><Link href="/admin/coupons"><span className="admin__mono">{marketing.topCoupon.code}</span></Link> <span className="admin__muted">· {plural(marketing.topCoupon.redemptions, "use")}, {inr(marketing.topCoupon.discount)} given</span></p>
          ) : <p className="cc-note"><span className="admin__muted">No coupon usage in 30 days</span></p>}
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Founder KPIs</h2></div>
          <div className="cc-mini">
            <div><b>{founder.repeatRate}%</b><span>Repeat</span></div>
            <div><b>{inrK(founder.ltv)}</b><span>Avg LTV</span></div>
            <div><b data-tone={founder.refundRate > 5 ? "warn" : undefined}>{founder.refundRate}%</b><span>Refund</span></div>
          </div>
          <p className="cc-note"><span className="admin__muted">Avg fulfillment</span> <b className="admin__mono">{hrs(founder.avgFulfillmentHours)}</b></p>
        </section>

        <section className="cc-card cc-card--ai" aria-label="Samorah Assistant (coming soon)">
          <div className="cc-card__head"><h2 className="cc-card__title">Samorah Assistant</h2><span className="cc-soon">soon</span></div>
          <p className="cc-ai__hint">A daily brief of what needs you — delayed orders, low stock, drafts ready. Reserved.</p>
        </section>
      </div>

      {/* Inventory (4) */}
      <section data-widget="inventory" className="cc-card">
        <div className="cc-card__head"><h2 className="cc-card__title">Inventory</h2><Link href="/admin/products" className="text-link">Manage</Link></div>
        <div className="cc-inv">
          <Link href="/admin/products" className="cc-inv__bucket" data-tone={inventory.criticalCount ? "critical" : "plain"}><b>{inventory.criticalCount}</b><span>Critical</span></Link>
          <Link href="/admin/products" className="cc-inv__bucket" data-tone={inventory.warningCount ? "warn" : "plain"}><b>{inventory.warningCount}</b><span>Warning</span></Link>
          <div className="cc-inv__bucket"><b>{inventory.healthyCount}</b><span>Healthy</span></div>
        </div>
        {inventory.critical.length ? (
          <ul className="cc-inv__list">
            {inventory.critical.map((c) => (
              <li key={c.id}>
                <span className="cc-inv__name">{c.name}</span>
                <span className="admin__muted">{c.stock <= 0 ? "Out of stock" : c.daysLeft != null ? `${c.stock} left · ~${plural(c.daysLeft, "day")} left` : `${c.stock} left`}</span>
                <Link href="/admin/products" className="cc-inv__manage">Manage →</Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Integration Status — each clickable to its console (point 10) */}
      <section data-widget="integrations" className="cc-card">
        <div className="cc-card__head"><h2 className="cc-card__title">Integrations</h2><span className="admin__muted">{integrations.connected}/{integrations.total} connected</span></div>
        <div className="cc-integ">
          {integrations.items.map((it) => (
            <a key={it.key} href={INTEGRATION_CONSOLE[it.key] ?? "/admin/health"} target={INTEGRATION_CONSOLE[it.key] ? "_blank" : undefined} rel="noopener noreferrer" className="cc-integ__item" data-ok={it.ok ? "1" : undefined}>
              <span className="cc-integ__dot" aria-hidden>{it.ok ? "🟢" : "⚪"}</span>
              <span className="cc-integ__name">{it.label}</span>
              <span className="cc-integ__note">{it.ok ? it.note : "not configured"}</span>
              <span className="cc-integ__cta">{it.ok ? "Open →" : "Configure →"}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Activity feed (10, 11) */}
      <section data-widget="activity" className="cc-card">
        <div className="cc-card__head"><h2 className="cc-card__title">Recent activity</h2><Link href="/admin/audit" className="text-link">View all</Link></div>
        <ActivityFeed items={activity} />
      </section>

      <section className="ash-jump">
        <h2 className="ash-jump__title">Modules</h2>
        <div className="ash-jump__row">
          <Link href="/admin/orders" className="ash-jump__card"><span className="ash-jump__name">Orders</span><span className="ash-jump__desc">Cancellations, refunds, payment state</span></Link>
          <Link href="/admin/fulfillment" className="ash-jump__card"><span className="ash-jump__name">Fulfillment</span><span className="ash-jump__desc">Pick → pack → QC → dispatch, triage</span></Link>
        </div>
      </section>
    </main>
  );
}

function queueCountFor(q: { label: string; count: number }[], prefix: string): number {
  const item = q.find((w) => w.label.startsWith(prefix));
  return item ? item.count : 0;
}
