import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getAnalytics } from "@/services/analyticsService";

/**
 * Analytics — `/admin/analytics`. The Insights module: read-only dashboards over
 * every other module's data (revenue · fulfillment · delivery · logistics · returns
 * · refunds · courier performance). analytics.view (manager+) only. A time window
 * scopes every metric.
 */
export const metadata: Metadata = { title: "Analytics", robots: { index: false } };
export const dynamic = "force-dynamic";

const WINDOWS = [{ k: "7", l: "7 days" }, { k: "30", l: "30 days" }, { k: "90", l: "90 days" }, { k: "all", l: "All time" }];
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const hrs = (n: number | null) => (n == null ? "—" : n < 48 ? `${n}h` : `${Math.round((n / 24) * 10) / 10}d`);
const mins = (n: number | null) => (n == null ? "—" : n < 60 ? `${n}m` : `${Math.round((n / 60) * 10) / 10}h`);
const pct = (n: number) => `${n}%`;

function Tile({ v, l, tone }: { v: string; l: string; tone?: string }) {
  return <div className="ash-metric"><span className="ash-metric__v" data-tone={tone ?? "plain"}>{v}</span><span className="ash-metric__l">{l}</span></div>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "analytics.view")) {
    return (
      <main className="admin">
        <header className="admin__head"><p className="admin__eyebrow">Insights · {staff.role}</p><h1 className="admin__title">Analytics</h1></header>
        <p className="admin__empty">Analytics needs the analytics.view capability (manager+).</p>
      </main>
    );
  }

  const { window } = await searchParams;
  const win = window === "7" || window === "90" || window === "all" ? window : "30";
  const a = await getAnalytics(win === "all" ? null : Number(win));
  const maxReason = Math.max(1, ...a.returns.byReason.map((r) => r.count));

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Insights · {staff.role}</p>
        <h1 className="admin__title">Analytics</h1>
        <p className="admin__count">{a.revenue.orders} paid orders in window</p>
      </header>

      <nav className="ff-queues" aria-label="Time window">
        {WINDOWS.map((w) => (
          <Link key={w.k} href={`/admin/analytics?window=${w.k}`} className="ff-queue" data-active={win === w.k ? "1" : "0"}>{w.l}</Link>
        ))}
      </nav>

      <section className="ash-metrics">
        <h2 className="ash-jump__title">Revenue</h2>
        <div className="ash-metrics__row">
          <Tile v={inr(a.revenue.gross)} l="Gross revenue" />
          <Tile v={inr(a.revenue.net)} l="Net (after refunds)" />
          <Tile v={String(a.revenue.orders)} l="Paid orders" />
          <Tile v={inr(a.revenue.aov)} l="Avg order value" />
          <Tile v={String(a.revenue.units)} l="Units sold" />
        </div>
      </section>

      <section className="ash-metrics">
        <h2 className="ash-jump__title">Fulfillment</h2>
        <div className="ash-metrics__row">
          <Tile v={mins(a.fulfillment.avgPickMinutes)} l="Avg pick time" />
          <Tile v={mins(a.fulfillment.avgPackMinutes)} l="Avg pack time" />
          <Tile v={hrs(a.fulfillment.avgCycleHours)} l="Order→dispatch" />
          <Tile v={String(a.fulfillment.shipped)} l="Shipped" />
          <Tile v={String(a.fulfillment.delivered)} l="Delivered" />
        </div>
      </section>

      <section className="ash-metrics">
        <h2 className="ash-jump__title">Delivery & logistics</h2>
        <div className="ash-metrics__row">
          <Tile v={hrs(a.delivery.avgDeliveryHours)} l="Avg delivery time" />
          <Tile v={pct(a.delivery.rtoRate)} l="RTO rate" tone={a.delivery.rtoRate >= 10 ? "warn" : "plain"} />
          <Tile v={pct(a.delivery.exceptionRate)} l="Exception rate" tone={a.delivery.exceptionRate >= 10 ? "warn" : "plain"} />
          <Tile v={inr(a.logistics.shippingCostTotal)} l="Shipping cost" />
          <Tile v={inr(a.logistics.revenueAfterShipping)} l="Revenue after shipping" />
        </div>
      </section>

      <section className="ash-metrics">
        <h2 className="ash-jump__title">Returns & refunds</h2>
        <div className="ash-metrics__row">
          <Tile v={String(a.returns.count)} l="Returns" />
          <Tile v={pct(a.returns.rate)} l="Return rate" tone={a.returns.rate >= 10 ? "warn" : "plain"} />
          <Tile v={String(a.refunds.count)} l="Refunds" />
          <Tile v={inr(a.refunds.total)} l="Refund total" />
          <Tile v={pct(a.refunds.rate)} l="Refund rate" tone={a.refunds.rate >= 10 ? "warn" : "plain"} />
        </div>
        {a.returns.byReason.length ? (
          <div className="an-bars">
            {a.returns.byReason.map((r) => (
              <div key={r.reason} className="an-bar">
                <span className="an-bar__label">{r.reason}</span>
                <span className="an-bar__track"><span className="an-bar__fill" style={{ width: `${(r.count / maxReason) * 100}%` }} /></span>
                <span className="an-bar__n">{r.count}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="ash-metrics">
        <h2 className="ash-jump__title">Courier performance</h2>
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>Courier</th><th>Shipments</th><th>Avg delivery</th><th>RTO rate</th></tr></thead>
            <tbody>
              {a.couriers.map((c) => (
                <tr key={c.courier}><td>{c.courier}</td><td className="admin__mono">{c.shipments}</td><td className="admin__mono">{hrs(c.avgDeliveryHours)}</td><td className="admin__mono">{pct(c.rtoRate)}</td></tr>
              ))}
              {a.couriers.length === 0 ? <tr><td colSpan={4} className="admin__empty">No shipments in window.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
