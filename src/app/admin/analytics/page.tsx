import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getAnalytics } from "@/services/analyticsService";
import { getChannelReport } from "@/services/reportsService";
import { getSearchInsights, getCampaignReport } from "@/services/marketingAnalyticsService";
import { getBusinessOverview } from "@/services/businessOverviewService";

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
  const winDays = win === "all" ? null : Number(win);
  const [a, search, channels, campaigns, overview] = await Promise.all([
    getAnalytics(winDays),
    getSearchInsights(winDays ?? 3650),
    getChannelReport(winDays),
    getCampaignReport(winDays),
    getBusinessOverview(winDays),
  ]);
  const maxReason = Math.max(1, ...a.returns.byReason.map((r) => r.count));
  const maxChannelRev = Math.max(1, ...channels.map((c) => c.revenue));

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

      {/* ── Business overview — the CEO glance (review point 11) ── */}
      <section className="ash-metrics">
        <h2 className="ash-jump__title">Business overview</h2>
        <div className="ash-metrics__row" style={{ marginBottom: 10 }}>
          <Tile v={String(overview.today.orders)} l="Orders today" />
          <Tile v={inr(overview.today.revenue)} l="Revenue today" />
          <Tile v={inr(overview.window.revenue)} l={`Revenue (${win === "all" ? "all" : win + "d"})`} />
          <Tile v={inr(overview.window.avgBasket)} l="Average basket" />
          <Tile v={pct(overview.customers.repeatRate)} l="Repeat customers" />
        </div>
        <div className="ash-metrics__row" style={{ marginBottom: 10 }}>
          <Tile v={String(overview.window.pending)} l="Pending orders" tone={overview.window.pending ? "warn" : "plain"} />
          <Tile v={String(overview.window.cancelled)} l="Cancelled" />
          <Tile v={String(overview.window.refunded)} l="Refunded" />
          <Tile v={pct(overview.payment.codShare)} l="COD share" />
          <Tile v={pct(overview.payment.prepaidShare)} l="Prepaid share" />
        </div>
        <div className="ash-metrics__row">
          <Tile v={String(overview.inventory.outOfStock)} l="Out of stock" tone={overview.inventory.outOfStock ? "warn" : "plain"} />
          <Tile v={String(overview.inventory.lowStock)} l="Low stock" tone={overview.inventory.lowStock ? "warn" : "plain"} />
          <Tile v={String(overview.customers.total)} l="Total customers" />
        </div>
        <div className="od-grid" style={{ marginTop: 12 }}>
          <div className="od-card">
            <h3 className="od-card__title">Best sellers</h3>
            {overview.bestSellers.map((p) => (
              <div key={p.name} className="od-line"><span>{p.name}</span><span className="admin__muted">{p.units}u · {inr(p.revenue)}</span></div>
            ))}
          </div>
          <div className="od-card">
            <h3 className="od-card__title">Worst sellers <span className="admin__muted">— slow movers</span></h3>
            {overview.worstSellers.map((p) => (
              <div key={p.name} className="od-line"><span>{p.name}</span><span className="admin__muted" data-tone={p.units === 0 ? "warn" : undefined}>{p.units}u · {inr(p.revenue)}</span></div>
            ))}
          </div>
        </div>
      </section>

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

      {/* ── Search intelligence (review points 1, 18) ── */}
      <section className="ash-metrics">
        <h2 className="ash-jump__title">Search intelligence</h2>
        <div className="ash-metrics__row" style={{ marginBottom: 14 }}>
          <Tile v={String(search.totalSearches)} l="Searches" />
          <Tile v={pct(search.zeroResultShare)} l="Zero-result rate" tone={search.zeroResultShare >= 20 ? "warn" : "plain"} />
        </div>
        <div className="od-grid">
          <div className="od-card">
            <h3 className="od-card__title">Top searches</h3>
            {search.top.length ? search.top.map((s) => (
              <div key={s.query} className="od-line">
                <span>{s.query}</span>
                <span className="admin__muted">{s.searches}× · avg {s.avgResults} results</span>
              </div>
            )) : <p className="admin__muted">No storefront searches in window.</p>}
          </div>
          <div className="od-card">
            <h3 className="od-card__title">Zero-result searches <span className="admin__muted">— unmet demand</span></h3>
            {search.zeroResult.length ? search.zeroResult.map((s) => (
              <div key={s.query} className="od-line"><span>{s.query}</span><span className="admin__muted" data-tone="warn">{s.searches}× · 0 results</span></div>
            )) : <p className="admin__muted">Every search found something. ✦</p>}
          </div>
        </div>
        <p className="admin__muted" style={{ marginTop: 8, fontSize: 12 }}>Demand signal: a term searched often with 0 results is a product worth adding.</p>
      </section>

      {/* ── Marketing attribution by channel (review point 19) ── */}
      <section className="ash-metrics">
        <h2 className="ash-jump__title">Attribution by channel</h2>
        {channels.length ? (
          <div className="an-bars">
            {channels.map((c) => (
              <div key={c.channel} className="an-bar">
                <span className="an-bar__label">{c.channel}</span>
                <span className="an-bar__track"><span className="an-bar__fill" style={{ width: `${(c.revenue / maxChannelRev) * 100}%` }} /></span>
                <span className="an-bar__n">{inr(c.revenue)} · {c.orders}o · AOV {inr(c.aov)} · {pct(c.share)}</span>
              </div>
            ))}
          </div>
        ) : <p className="admin__empty">No attributed orders in window.</p>}
      </section>

      {/* ── UTM campaigns (review points 13, 20) ── */}
      <section className="ash-metrics">
        <h2 className="ash-jump__title">UTM campaigns</h2>
        {campaigns.length ? (
          <p className="admin__muted" style={{ marginBottom: 8, fontSize: 12 }}>
            Top: <b>{campaigns[0].campaign}</b> ({inr(campaigns[0].revenue)}) · Weakest: <b>{campaigns[campaigns.length - 1].campaign}</b> ({inr(campaigns[campaigns.length - 1].revenue)})
            {" "}· ROAS/ROI need ad-spend (manual entry — not stored).
          </p>
        ) : null}
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>Source</th><th>Medium</th><th>Campaign</th><th>Channel</th><th>Orders</th><th>Revenue</th><th>AOV</th><th>Share</th></tr></thead>
            <tbody>
              {campaigns.map((c, i) => (
                <tr key={i}><td>{c.source}</td><td>{c.medium}</td><td>{c.campaign}</td><td>{c.channel}</td><td className="admin__mono">{c.orders}</td><td className="admin__mono">{inr(c.revenue)}</td><td className="admin__mono">{inr(c.aov)}</td><td className="admin__mono">{pct(c.share)}</td></tr>
              ))}
              {campaigns.length === 0 ? <tr><td colSpan={8} className="admin__empty">No campaign-tagged orders in window.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Live visitors / real-time conversion need GA4 Realtime (link-out — not first-party). */}
      <section className="ash-metrics">
        <h2 className="ash-jump__title">Live & behavioural</h2>
        <p className="admin__muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Live users, real-time visitors, scroll/impression heatmaps and session recordings live in
          {" "}<a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="text-link">GA4 Realtime</a> and
          {" "}<a href="https://clarity.microsoft.com" target="_blank" rel="noopener noreferrer" className="text-link">Microsoft Clarity</a> —
          the dashboards above are first-party (orders + search), so they stay accurate without an external API round-trip.
        </p>
      </section>
    </main>
  );
}
