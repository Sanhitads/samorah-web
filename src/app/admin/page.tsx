import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getDashboardStats, getOperationalMetrics } from "@/services/orderAdminService";
import { getReorderList } from "@/services/packagingService";
import { getBusinessDashboard } from "@/services/dashboardService";
import { getRecentAuditEvents } from "@/services/auditService";

/**
 * Admin Dashboard — `/admin`. The landing module (SLP principle 21): headline
 * operational counts + jump-off links to the live modules. Renders inside the
 * admin shell (nav supplied by the layout).
 */
export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function AdminDashboard() {
  const staff = await requireStaff("editor");
  const [stats, metrics, reorder, biz, activity] = await Promise.all([
    getDashboardStats(), getOperationalMetrics(), getReorderList(), getBusinessDashboard(), getRecentAuditEvents({ limit: 8 }),
  ]);
  const dur = (m: number | null) => (m == null ? "—" : m < 60 ? `${m}m` : `${Math.round((m / 60) * 10) / 10}h`);
  const age = (h: number | null) => (h == null ? "—" : h < 24 ? `${h}h` : `${Math.round((h / 24) * 10) / 10}d`);

  const tiles: { label: string; value: number; href?: string; tone?: string }[] = [
    { label: "Awaiting fulfillment", value: stats.awaitingFulfillment, href: "/admin/fulfillment" },
    { label: "Ready for dispatch", value: stats.readyForDispatch, href: "/admin/fulfillment", tone: "gold" },
    { label: "On hold", value: stats.onHold, href: "/admin/fulfillment", tone: stats.onHold ? "warn" : undefined },
    { label: "In transit", value: stats.shippedActive, href: "/admin/orders" },
    { label: "Refunds pending", value: stats.refundsPending, href: "/admin/orders", tone: stats.refundsPending ? "warn" : undefined },
    { label: "Packaging to reorder", value: reorder.length, href: "/admin/packaging", tone: reorder.length ? "warn" : undefined },
    { label: "Total orders", value: stats.totalOrders, href: "/admin/orders" },
  ];

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Dashboard</h1>
        <p className="admin__count">At-a-glance business & operational state</p>
      </header>

      {/* Business KPIs (today) */}
      <section className="ash-metrics">
        <h2 className="ash-jump__title">Today</h2>
        <div className="ash-metrics__row">
          <div className="ash-metric"><span className="ash-metric__v">{inr(biz.todayRevenue)}</span><span className="ash-metric__l">Revenue today</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{biz.todayOrders}</span><span className="ash-metric__l">Orders today</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{inr(biz.aov)}</span><span className="ash-metric__l">Avg order (30d)</span></div>
          <Link href="/admin/products" className="ash-metric ash-tile--link"><span className="ash-metric__v" style={{ fontSize: "1rem" }}>{biz.topProduct?.name ?? "—"}</span><span className="ash-metric__l">Top seller{biz.topProduct ? ` · ${biz.topProduct.units}u` : ""}</span></Link>
          <Link href="/admin/products" className="ash-metric ash-tile--link"><span className="ash-metric__v" data-tone={biz.lowStockVariants ? "warn" : "plain"}>{biz.lowStockVariants}</span><span className="ash-metric__l">Low-stock variants</span></Link>
          <div className="ash-metric"><span className="ash-metric__v" data-tone={biz.pendingEmails ? "warn" : "plain"}>{biz.pendingEmails}</span><span className="ash-metric__l">Pending emails</span></div>
          <Link href="/admin/orders" className="ash-metric ash-tile--link"><span className="ash-metric__v" data-tone={biz.failedPayments ? "warn" : "plain"}>{biz.failedPayments}</span><span className="ash-metric__l">Failed payments (30d)</span></Link>
        </div>
      </section>

      <div className="ash-tiles">
        {tiles.map((t) => {
          const inner = (
            <>
              <span className="ash-tile__value" data-tone={t.tone ?? "plain"}>{t.value}</span>
              <span className="ash-tile__label">{t.label}</span>
            </>
          );
          return t.href ? (
            <Link key={t.label} href={t.href} className="ash-tile ash-tile--link">{inner}</Link>
          ) : (
            <div key={t.label} className="ash-tile">{inner}</div>
          );
        })}
      </div>

      <section className="ash-metrics">
        <h2 className="ash-jump__title">Operational metrics</h2>
        <div className="ash-metrics__row">
          <div className="ash-metric"><span className="ash-metric__v">{dur(metrics.avgPickMinutes)}</span><span className="ash-metric__l">Avg pick time</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{dur(metrics.avgPackMinutes)}</span><span className="ash-metric__l">Avg pack time</span></div>
          <div className="ash-metric"><span className="ash-metric__v" data-tone={metrics.oldestWaitingHours != null && metrics.oldestWaitingHours >= 48 ? "warn" : "plain"}>{age(metrics.oldestWaitingHours)}</span><span className="ash-metric__l">Oldest waiting</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{metrics.ordersWaiting}</span><span className="ash-metric__l">Orders waiting</span></div>
          <div className="ash-metric"><span className="ash-metric__v" data-tone={metrics.ordersOnHold ? "warn" : "plain"}>{metrics.ordersOnHold}</span><span className="ash-metric__l">On hold</span></div>
          <div className="ash-metric"><span className="ash-metric__v" data-tone={metrics.refundQueue ? "warn" : "plain"}>{metrics.refundQueue}</span><span className="ash-metric__l">Refund queue</span></div>
        </div>
      </section>

      {/* Recent activity timeline */}
      <section className="ash-activity">
        <div className="ash-activity__head">
          <h2 className="ash-jump__title">Recent activity</h2>
          <Link href="/admin/audit" className="text-link">View all</Link>
        </div>
        <ol className="ash-activity__list">
          {activity.map((e) => (
            <li key={e.id} className="ash-activity__item">
              <span className="ash-activity__time">{ago(e.created_at)}</span>
              <span className="ash-activity__event">{EVENT_LABEL(e.event)}{e.orderNumber ? <> · <Link href={`/admin/orders/${e.orderNumber}`} className="admin__mono">{e.orderNumber}</Link></> : null}</span>
            </li>
          ))}
          {activity.length === 0 ? <li className="admin__muted">No activity yet.</li> : null}
        </ol>
      </section>

      <section className="ash-jump">
        <h2 className="ash-jump__title">Modules</h2>
        <div className="ash-jump__row">
          <Link href="/admin/orders" className="ash-jump__card">
            <span className="ash-jump__name">Orders</span>
            <span className="ash-jump__desc">Cancellations, refunds, payment state</span>
          </Link>
          <Link href="/admin/fulfillment" className="ash-jump__card">
            <span className="ash-jump__name">Fulfillment</span>
            <span className="ash-jump__desc">Pick → pack → QC → dispatch, triage</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
