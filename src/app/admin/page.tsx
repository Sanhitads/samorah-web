import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getDashboardStats, getOperationalMetrics } from "@/services/orderAdminService";
import { getReorderList } from "@/services/packagingService";
import { getBusinessDashboard } from "@/services/dashboardService";
import { getCommandCenter } from "@/services/commandCenterService";
import { getRecentAuditEvents } from "@/services/auditService";
import { ActivityFeed, type ActivityItem } from "@/components/admin/ActivityFeed";

/**
 * Admin Dashboard — `/admin`. Operational command center (dashboard v2): a place to
 * *act*, not just read. Hero KPIs → Quick Actions → Work Queue + Alerts (the morning
 * inbox) → operational + money bands → snapshots → inventory → activity feed. Stays
 * visually minimal — one sparkline, no chart library.
 */
export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inrK = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`);
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Activity feed mapping (icons + category + deep link) ──
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

interface Alert { tone: "critical" | "warn" | "info"; title: string; detail: string; href: string; action: string }
interface WorkItem { label: string; href: string; count: number }

export default async function AdminDashboard() {
  const staff = await requireStaff("editor");
  const [stats, metrics, reorder, biz, cc, activityRaw] = await Promise.all([
    getDashboardStats(), getOperationalMetrics(), getReorderList(), getBusinessDashboard(), getCommandCenter(),
    getRecentAuditEvents({ limit: 24 }),
  ]);
  const dur = (m: number | null) => (m == null ? "—" : m < 60 ? `${m}m` : `${Math.round((m / 60) * 10) / 10}h`);

  // Sales-trend delta vs yesterday (day-so-far comparison is rough but directional).
  const dayDelta = cc.trend.yesterday > 0 ? Math.round(((cc.trend.today - cc.trend.yesterday) / cc.trend.yesterday) * 100) : null;

  // ── Alerts (the inbox) ──
  const alerts: Alert[] = [];
  for (const c of cc.inventory.critical.slice(0, 4)) {
    alerts.push({ tone: c.stock <= 0 ? "critical" : "warn", title: c.name, detail: c.stock <= 0 ? "Out of stock" : `Only ${c.stock} left`, href: "/admin/products", action: "View" });
  }
  if (biz.failedPayments > 0) alerts.push({ tone: "warn", title: plural(biz.failedPayments, "failed payment"), detail: "Last 30 days", href: "/admin/orders", action: "Review" });
  if (cc.returnsQueue.toQc > 0) alerts.push({ tone: "warn", title: plural(cc.returnsQueue.toQc, "return"), detail: "Awaiting QC", href: "/admin/returns", action: "Open" });
  if (stats.onHold > 0) alerts.push({ tone: "warn", title: plural(stats.onHold, "order"), detail: "On hold — needs triage", href: "/admin/fulfillment", action: "Triage" });
  for (const k of cc.draftsPending.keys.slice(0, 3)) {
    alerts.push({ tone: "info", title: `${EVENT_LABEL(k)} draft`, detail: "Unpublished changes", href: k === "homepage" ? "/admin/homepage" : "/admin/content", action: "Publish" });
  }
  if (biz.pendingEmails > 5) alerts.push({ tone: "info", title: plural(biz.pendingEmails, "email"), detail: "Queued to send", href: "/admin/health", action: "Check" });

  // ── Work Queue (today's actions) ──
  const queue: WorkItem[] = [];
  if (stats.readyForDispatch > 0) queue.push({ label: `Dispatch ${plural(stats.readyForDispatch, "order")}`, href: "/admin/fulfillment", count: stats.readyForDispatch });
  if (cc.returnsQueue.toQc > 0) queue.push({ label: `Review ${plural(cc.returnsQueue.toQc, "return")} in QC`, href: "/admin/returns", count: cc.returnsQueue.toQc });
  if (stats.onHold > 0) queue.push({ label: `Resolve ${plural(stats.onHold, "on-hold order")}`, href: "/admin/fulfillment", count: stats.onHold });
  if (stats.refundsPending > 0) queue.push({ label: `Process ${plural(stats.refundsPending, "refund")}`, href: "/admin/orders", count: stats.refundsPending });
  if (cc.draftsPending.count > 0) queue.push({ label: `Publish ${plural(cc.draftsPending.count, "content draft")}`, href: "/admin/content", count: cc.draftsPending.count });
  if (biz.failedPayments > 0) queue.push({ label: `Follow up ${plural(biz.failedPayments, "failed payment")}`, href: "/admin/orders", count: biz.failedPayments });
  if (reorder.length > 0) queue.push({ label: `Reorder ${plural(reorder.length, "packaging item")}`, href: "/admin/packaging", count: reorder.length });

  // ── Activity feed items ──
  const activity: ActivityItem[] = activityRaw.map((e) => {
    const cat = categorize(e.entity_type, e.event);
    return { id: e.id, category: cat, label: EVENT_LABEL(e.event), detail: e.notes ?? null, href: hrefFor(cat, e.orderNumber), orderNumber: e.orderNumber, timeAgo: ago(e.created_at) };
  });

  // ── Sparkline (pure SVG, no chart lib) ──
  const spark = cc.trend.spark;
  const sparkMax = Math.max(1, ...spark);
  const sparkPts = spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${30 - (v / sparkMax) * 28}`).join(" ");

  // Hero KPIs — operational-first, revenue anchored, with visual emphasis (points 12 + 15).
  const hero = [
    { label: "Revenue today", value: inr(biz.todayRevenue), href: undefined as string | undefined, sub: dayDelta == null ? "vs ₹0 yesterday" : `${dayDelta >= 0 ? "▲" : "▼"} ${Math.abs(dayDelta)}% vs yesterday`, tone: "plain", delta: dayDelta },
    { label: "Pending dispatch", value: String(stats.readyForDispatch), href: "/admin/fulfillment", sub: `${stats.awaitingFulfillment} awaiting`, tone: stats.readyForDispatch ? "gold" : "plain", delta: null },
    { label: "Open returns", value: String(cc.returnsQueue.open), href: "/admin/returns", sub: cc.returnsQueue.toQc ? `${cc.returnsQueue.toQc} in QC` : "none in QC", tone: cc.returnsQueue.toQc ? "warn" : "plain", delta: null },
    { label: "Alerts", value: String(alerts.length), href: undefined, sub: alerts.some((a) => a.tone === "critical") ? "needs attention" : "under control", tone: alerts.length ? "warn" : "plain", delta: null },
  ];

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Dashboard</h1>
        <p className="admin__count">Everything that needs you today — at a glance.</p>
      </header>

      {/* Hero KPIs — visual emphasis (15) */}
      <section className="cc-hero">
        {hero.map((h) => {
          const inner = (
            <>
              <span className="cc-hero__value" data-tone={h.tone}>{h.value}</span>
              <span className="cc-hero__label">{h.label}</span>
              <span className="cc-hero__sub" data-tone={h.delta != null ? (h.delta >= 0 ? "up" : "down") : undefined}>{h.sub}</span>
            </>
          );
          return h.href ? <Link key={h.label} href={h.href} className="cc-hero__card cc-hero__card--link">{inner}</Link> : <div key={h.label} className="cc-hero__card">{inner}</div>;
        })}
      </section>

      {/* Quick Actions (1) */}
      <section className="cc-qa">
        <Link href="/admin/products" className="cc-qa__btn cc-qa__btn--primary">+ New Product</Link>
        <Link href="/admin/coupons" className="cc-qa__btn">+ New Coupon</Link>
        <Link href="/admin/homepage" className="cc-qa__btn">+ Homepage Draft</Link>
        <Link href="/admin/orders" className="cc-qa__btn">View Pending Orders</Link>
        <Link href="/admin/fulfillment" className="cc-qa__btn">Dispatch Ready Orders</Link>
      </section>

      {/* The morning inbox: Work Queue (16) + Alerts (2) */}
      <div className="cc-grid cc-grid--2">
        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">My Work Queue</h2><span className="admin__muted">Today</span></div>
          {queue.length ? (
            <ul className="cc-queue">
              {queue.map((q, i) => (
                <li key={i}><Link href={q.href} className="cc-queue__item"><span className="cc-queue__dot" /><span className="cc-queue__label">{q.label}</span><span className="cc-queue__go">→</span></Link></li>
              ))}
            </ul>
          ) : <p className="cc-empty">✦ You're all caught up. Nothing needs action right now.</p>}
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Alerts</h2><span className="admin__muted">{alerts.length || "0"}</span></div>
          {alerts.length ? (
            <ul className="cc-alerts">
              {alerts.map((a, i) => (
                <li key={i} className="cc-alert" data-tone={a.tone}>
                  <span className="cc-alert__mark" aria-hidden>{a.tone === "critical" ? "⛔" : a.tone === "warn" ? "⚠" : "◔"}</span>
                  <span className="cc-alert__body"><span className="cc-alert__title">{a.title}</span><span className="cc-alert__detail">{a.detail}</span></span>
                  <Link href={a.href} className="cc-alert__action">{a.action}</Link>
                </li>
              ))}
            </ul>
          ) : <p className="cc-empty">All clear — no alerts.</p>}
        </section>
      </div>

      {/* Money band: Sales Trend (3) + Revenue Breakdown (4) */}
      <div className="cc-grid cc-grid--2">
        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Sales trend</h2><span className="admin__muted">last 14 days</span></div>
          <div className="cc-trend">
            <div className="cc-trend__nums">
              <div className="cc-trend__n"><span className="cc-trend__v">{inr(cc.trend.today)}</span><span className="cc-trend__l">Today</span></div>
              <div className="cc-trend__n"><span className="cc-trend__v">{inr(cc.trend.yesterday)}</span><span className="cc-trend__l">Yesterday</span></div>
              <div className="cc-trend__n"><span className="cc-trend__v">{inrK(cc.trend.last7)}</span><span className="cc-trend__l">7 days</span></div>
              <div className="cc-trend__n"><span className="cc-trend__v">{inrK(cc.trend.last30)}</span><span className="cc-trend__l">30 days</span></div>
            </div>
            <svg className="cc-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
              <polyline points={sparkPts} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Revenue breakdown</h2><span className="admin__muted">30 days</span></div>
          <ul className="cc-break">
            <li><span>Gross</span><span className="admin__mono">{inr(cc.revenue.gross)}</span></li>
            <li><span>Shipping</span><span className="admin__mono">{inr(cc.revenue.shipping)}</span></li>
            <li><span>Tax (GST)</span><span className="admin__mono">{inr(cc.revenue.tax)}</span></li>
            <li><span>Refunds</span><span className="admin__mono" data-tone={cc.revenue.refunds ? "warn" : undefined}>−{inr(cc.revenue.refunds)}</span></li>
            <li className="cc-break__net"><span>Net (ex-tax)</span><span className="admin__mono">{inr(cc.revenue.net)}</span></li>
          </ul>
        </section>
      </div>

      {/* Operational band: Schedule (6) + Fulfillment health (10) + Cash flow (9) */}
      <div className="cc-grid cc-grid--3">
        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Today's schedule</h2></div>
          <ul className="cc-sched">
            <li><Link href="/admin/fulfillment"><b>{stats.readyForDispatch}</b> {plural(stats.readyForDispatch, "order").replace(/^\d+ /, "")} to dispatch</Link></li>
            <li><Link href="/admin/returns"><b>{cc.returnsQueue.toQc}</b> {cc.returnsQueue.toQc === 1 ? "return" : "returns"} to QC</Link></li>
            <li><Link href="/admin/shipments"><b>{cc.shipmentsAwaitingPickup}</b> {cc.shipmentsAwaitingPickup === 1 ? "shipment" : "shipments"} awaiting pickup</Link></li>
          </ul>
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Fulfillment health</h2></div>
          <ul className="cc-health">
            <FulfilRow label="Pick time" actual={metrics.avgPickMinutes} target={5} fmt={dur} />
            <FulfilRow label="Pack time" actual={metrics.avgPackMinutes} target={5} fmt={dur} />
          </ul>
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Cash flow</h2><span className="admin__muted">30 days</span></div>
          <ul className="cc-break">
            <li><span>Received</span><span className="admin__mono">{inr(cc.cashflow.received30)}</span></li>
            <li><span>COD pending</span><span className="admin__mono">{inr(cc.cashflow.pendingCod)}</span></li>
            <li><span>Refunds</span><span className="admin__mono" data-tone={cc.cashflow.refunds30 ? "warn" : undefined}>−{inr(cc.cashflow.refunds30)}</span></li>
            <li className="cc-note"><span className="admin__muted">Settlement dates need Razorpay sync</span></li>
          </ul>
        </section>
      </div>

      {/* Snapshot band: Customers (7) + Marketing (8) + Founder KPIs (13) + AI (13) */}
      <div className="cc-grid cc-grid--4">
        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Customers</h2><span className="admin__muted">30d active</span></div>
          <div className="cc-mini">
            <div><b>{cc.customers.new30}</b><span>New</span></div>
            <div><b>{cc.customers.returning30}</b><span>Returning</span></div>
            <Link href="/admin/customers"><b>{cc.customers.vip}</b><span>VIP</span></Link>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Marketing</h2></div>
          {cc.marketing.topCoupon ? (
            <div className="cc-mini cc-mini--wide">
              <Link href="/admin/coupons"><b className="admin__mono">{cc.marketing.topCoupon.code}</b><span>{plural(cc.marketing.topCoupon.redemptions, "use")}</span></Link>
              <div><b>{inr(cc.marketing.topCoupon.discount)}</b><span>Given</span></div>
            </div>
          ) : <p className="admin__muted" style={{ fontSize: ".85rem" }}>No coupon usage in 30 days.</p>}
          <p className="cc-note"><span className="admin__muted">Carts · opens · attribution need GA4/Resend</span></p>
        </section>

        <section className="cc-card">
          <div className="cc-card__head"><h2 className="cc-card__title">Founder KPIs</h2></div>
          <div className="cc-mini">
            <div><b>{cc.founder.repeatRate}%</b><span>Repeat</span></div>
            <div><b>{inrK(cc.founder.ltv)}</b><span>Avg LTV</span></div>
            <div><b data-tone={cc.founder.refundRate > 5 ? "warn" : undefined}>{cc.founder.refundRate}%</b><span>Refund</span></div>
          </div>
        </section>

        {/* Reserved for Samorah Assistant — kept minimal, not built (13) */}
        <section className="cc-card cc-card--ai" aria-label="Samorah Assistant (coming soon)">
          <div className="cc-card__head"><h2 className="cc-card__title">Samorah Assistant</h2><span className="cc-soon">soon</span></div>
          <p className="cc-ai__hint">A daily brief of what needs you — delayed orders, low stock, drafts ready. Reserved.</p>
        </section>
      </div>

      {/* Inventory buckets (5) */}
      <section className="cc-card">
        <div className="cc-card__head"><h2 className="cc-card__title">Inventory</h2><Link href="/admin/products" className="text-link">Manage</Link></div>
        <div className="cc-inv">
          <Link href="/admin/products" className="cc-inv__bucket" data-tone={cc.inventory.criticalCount ? "critical" : "plain"}><b>{cc.inventory.criticalCount}</b><span>Critical</span></Link>
          <Link href="/admin/products" className="cc-inv__bucket" data-tone={cc.inventory.warningCount ? "warn" : "plain"}><b>{cc.inventory.warningCount}</b><span>Warning</span></Link>
          <div className="cc-inv__bucket"><b>{cc.inventory.healthyCount}</b><span>Healthy</span></div>
        </div>
        {cc.inventory.critical.length ? (
          <ul className="cc-inv__list">
            {cc.inventory.critical.map((c) => (
              <li key={c.id}><Link href="/admin/products"><span>{c.name}</span><span className="admin__muted">{c.stock <= 0 ? "Out of stock" : `${c.stock} left`}</span></Link></li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Activity feed (11) — icons, filters, deep links */}
      <section className="cc-card">
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

/** One fulfillment metric vs its target, with a direction arrow. */
function FulfilRow({ label, actual, target, fmt }: { label: string; actual: number | null; target: number; fmt: (m: number | null) => string }) {
  const ok = actual == null || actual <= target;
  return (
    <li className="cc-health__row">
      <span className="cc-health__l">{label}</span>
      <span className="cc-health__v" data-tone={ok ? "up" : "down"}>{fmt(actual)} {actual == null ? "" : ok ? "↓" : "↑"}</span>
      <span className="cc-health__t admin__muted">target {fmt(target)}</span>
    </li>
  );
}
