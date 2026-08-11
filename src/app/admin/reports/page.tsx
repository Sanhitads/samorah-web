import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getReports, getProfitReport, getFragranceReport, getCohortReport, getChannelReport, getExecutiveSummary } from "@/services/reportsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { assessFinancialHealth } from "@/lib/reports/financialHealth";
import { ReportsExecutiveSummary } from "@/components/admin/ReportsExecutiveSummary";
import { ReportStatusBanner } from "@/components/admin/ReportStatusBanner";
import { FinancialHealthBanner } from "@/components/admin/FinancialHealthBanner";
import { KpiCard } from "@/components/admin/KpiCard";
import { resolveDrill } from "@/lib/analytics/analyticsRegistry";

/**
 * Reports — `/admin/reports`. Business & filing reports (GST by state, top
 * products, coupon usage, repeat rate, orders-by-state) complementing the
 * operational Analytics. analytics.view (manager+).
 */
export const metadata: Metadata = { title: "Reports", robots: { index: false } };
export const dynamic = "force-dynamic";

const inr = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const WINDOWS = [{ k: "30", l: "30 days" }, { k: "90", l: "90 days" }, { k: "365", l: "1 year" }, { k: "all", l: "All time" }];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "analytics.view")) {
    return <main className="admin"><header className="admin__head"><p className="admin__eyebrow">Insights · {staff.role}</p><h1 className="admin__title">Reports</h1></header><p className="admin__empty">Reports need the analytics.view capability (manager+).</p></main>;
  }

  const sp = await searchParams;
  const win = ["30", "90", "365", "all"].includes(sp.window ?? "") ? (sp.window as string) : "30";
  const windowDays = win === "all" ? null : Number(win);

  // Resilient foundation (R1A): each report degrades independently — one failing aggregation renders a
  // scoped fallback for that section instead of blanking the whole financial report.
  const settled = await Promise.allSettled([
    getReports(windowDays), getProfitReport(windowDays), getFragranceReport(windowDays), getCohortReport(6), getChannelReport(windowDays),
    getExecutiveSummary(windowDays), getSiteSettings(),
  ]);
  for (const s of settled) if (s.status === "rejected") console.error("[reports] a section failed to calculate:", s.reason);
  const val = <T,>(res: PromiseSettledResult<T>): T | null => (res.status === "fulfilled" ? res.value : null);
  const [rRes, profitRes, fragRes, cohortRes, channelRes, execRes, settingsRes] = settled;
  const r = val(rRes), profit = val(profitRes), fragrances = val(fragRes), cohorts = val(cohortRes), channels = val(channelRes);
  const exec = val(execRes), settings = val(settingsRes);

  const canExport = hasCapability(staff.role, "data.export");
  const bestFrag = fragrances?.[0]; const worstFrag = fragrances && fragrances.length > 1 ? fragrances[fragrances.length - 1] : undefined;
  const sectionError = <p className="admin__empty">This section couldn’t be calculated right now — the rest of the report is unaffected.</p>;

  // R2 presentation helpers — all values consumed from the canonical engine/service output; nothing recomputed.
  const windowLabel = WINDOWS.find((w) => w.k === win)?.l ?? "30 days";
  const ordersRange = win === "all" ? null : `${win}d`;

  // R3 drill-downs — registry-driven, routes IDENTICAL to the Executive Summary (orders / customers).
  // No fake destinations: Orders-by-state / GST / fragrance / channels / cohorts stay value-only because
  // /admin/orders has no state filter and those rows have no real per-row destination.
  const dOrders = resolveDrill("orders", ordersRange ? { range: ordersRange } : undefined);
  const dCustomers = resolveDrill("customers");
  // R4 tooltip consistency — descriptive tooltip + destination (parity with the Executive Summary / Analytics).
  const revTip = dOrders ? `Revenue after refunds (ex-GST) · ${dOrders.tooltip}` : "Revenue after refunds (ex-GST)";
  const profitTip = dOrders ? `Operating profit — revenue − expenses · ${dOrders.tooltip}` : "Operating profit — revenue − expenses";
  const buyersTip = dCustomers ? `Distinct paying customers · ${dCustomers.tooltip}` : "Distinct paying customers";
  const health = profit && settings
    ? assessFinancialHealth({
        variantsMissingCost: profit.variantsMissingCost,
        revenue: profit.revenue,
        gstCollected: profit.gstCollected,
        refunds: profit.refunds,
        shippingCostPerOrder: settings.costs.shippingCostPerOrder,
        paymentFeePercent: settings.costs.paymentFeePercent,
      })
    : null;

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Insights · {staff.role}</p>
        <h1 className="admin__title">Reports</h1>
      </header>

      <nav className="ff-queues" aria-label="Window">
        {WINDOWS.map((w) => <Link key={w.k} href={`/admin/reports?window=${w.k}`} className="ff-queue" data-active={win === w.k ? "1" : "0"}>{w.l}</Link>)}
      </nav>

      {/* R2 — Report Status banner (always) + severity-aware Financial Health banner (integrity before figures) */}
      {profit ? <ReportStatusBanner windowLabel={windowLabel} generatedAtMs={profit.freshness.fetchedAtMs} paidOrders={profit.orders} /> : null}
      {/* R4: suppress health warnings on an empty report — config notes read as noise with zero paid orders. */}
      {health && profit && profit.orders > 0 ? <FinancialHealthBanner health={health} /> : null}

      {/* R2 — Executive Summary (5 KPIs; every value from the canonical engine via getExecutiveSummary) */}
      {exec ? <ReportsExecutiveSummary data={exec} ordersRange={ordersRange} windowLabel={windowLabel} /> : null}

      {/* Profit / P&L (R10) — canonical Financial Engine (R1A: ex-GST, refund-adjusted, no shipping double-count) */}
      {profit ? (
      <section className="ash-metrics">
        <div className="ash-activity__head">
          <h2 className="ash-jump__title">Profit &amp; loss</h2>
          <span className="admin__muted">{profit.orders} paid orders · ex-GST · refund-adjusted</span>
        </div>
        <div className="ash-metrics__row" style={{ marginBottom: 12 }}>
          <KpiCard label="Operating profit" value={inr(profit.operatingProfit)} href={dOrders?.href} tooltip={profitTip} />
          <KpiCard label="Margin" value={`${profit.margin}%`} tooltip="Operating profit ÷ revenue" />
          <KpiCard label="Revenue (after refunds)" value={inr(profit.revenue)} href={dOrders?.href} tooltip={revTip} />
          <KpiCard label="COGS" value={inr(profit.cogs)} tooltip="Cost of goods sold — unit cost × quantity" />
        </div>
        <div className="admin__table-wrap">
          <table className="admin__table">
            <tbody>
              <tr><td>Net revenue (ex-GST, post-discount)</td><td className="admin__mono">{inr(profit.netRevenue)}</td></tr>
              <tr><td>− Refunds (revenue reversed)</td><td className="admin__mono">−{inr(profit.refunds)}</td></tr>
              <tr style={{ fontWeight: 600 }}><td>= Revenue after refunds</td><td className="admin__mono">{inr(profit.revenue)}</td></tr>
              <tr><td>− COGS (unit cost × qty)</td><td className="admin__mono">−{inr(profit.cogs)}</td></tr>
              <tr><td>− Packaging</td><td className="admin__mono">−{inr(profit.packaging)}</td></tr>
              <tr><td>− Shipping cost (courier)</td><td className="admin__mono">−{inr(profit.shippingCost)}</td></tr>
              <tr><td>− Payment gateway fees</td><td className="admin__mono">−{inr(profit.gatewayFees)}</td></tr>
              <tr style={{ fontWeight: 600 }}><td>= Operating profit</td><td className="admin__mono">{inr(profit.operatingProfit)}</td></tr>
              <tr><td className="admin__muted">GST collected (pass-through, remitted — not profit)</td><td className="admin__mono admin__muted">{inr(profit.gstCollected)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="admin__table-wrap" style={{ marginTop: 8 }}>
          <table className="admin__table">
            <tbody>
              <tr><td className="admin__muted">Gross sales (incl. GST, pre-discount)</td><td className="admin__mono admin__muted">{inr(profit.grossSales)}</td></tr>
              <tr><td className="admin__muted">Discounts</td><td className="admin__mono admin__muted">−{inr(profit.discounts)}</td></tr>
              <tr><td className="admin__muted">Shipping collected (incl. GST — already within net revenue)</td><td className="admin__mono admin__muted">{inr(profit.shippingCollected)}</td></tr>
            </tbody>
          </table>
        </div>
        {profit.variantsMissingCost > 0 ? <p className="cfg-hint">⚠ {profit.variantsMissingCost} sold variant{profit.variantsMissingCost === 1 ? " has" : "s have"} no cost set — profit is optimistic until cost is entered on those variants (Products → edit → variant “cost ₹”). Packaging, courier cost and payment-fee % come from Settings → Operating costs.</p> : <p className="cfg-hint">Packaging, courier cost and payment-fee % come from Settings → Operating costs.</p>}
      </section>
      ) : <section className="ash-metrics"><div className="ash-activity__head"><h2 className="ash-jump__title">Profit &amp; loss</h2></div>{sectionError}</section>}

      {/* GST report */}
      <section className="ash-metrics">
        <div className="ash-activity__head">
          <h2 className="ash-jump__title">GST report</h2>
          {canExport ? <a className="text-link" href={`/api/admin/reports/gst?window=${win}`}>Export CSV</a> : null}
        </div>
        {r ? (<>
        <div className="ash-metrics__row" style={{ marginBottom: 12 }}>
          <div className="ash-metric"><span className="ash-metric__v">{inr(r.gst.taxable)}</span><span className="ash-metric__l">Taxable value</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{inr(r.gst.cgst)}</span><span className="ash-metric__l">CGST</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{inr(r.gst.sgst)}</span><span className="ash-metric__l">SGST</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{inr(r.gst.igst)}</span><span className="ash-metric__l">IGST</span></div>
          <div className="ash-metric"><span className="ash-metric__v">{inr(r.gst.total)}</span><span className="ash-metric__l">Gross</span></div>
        </div>
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>State</th><th>Orders</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead>
            <tbody>
              {r.gst.byState.map((s) => (
                <tr key={s.state}><td>{s.state}</td><td className="admin__mono">{s.orders}</td><td className="admin__mono">{inr(s.taxable)}</td><td className="admin__mono">{inr(s.cgst)}</td><td className="admin__mono">{inr(s.sgst)}</td><td className="admin__mono">{inr(s.igst)}</td><td className="admin__mono">{inr(s.total)}</td></tr>
              ))}
              {r.gst.byState.length === 0 ? <tr><td colSpan={7} className="admin__empty">No paid orders in window.</td></tr> : null}
            </tbody>
          </table>
        </div>
        </>) : sectionError}
      </section>

      {r ? (<>
      <div className="od-grid">
        {/* Top products */}
        <section className="od-card">
          <h2 className="od-card__title">Top products</h2>
          {r.topProducts.length ? r.topProducts.map((p) => (
            <div key={p.name} className="od-line"><span>{p.name}</span><span className="admin__muted">{p.units}u</span><span className="admin__mono">{inr(p.revenue)}</span></div>
          )) : <p className="admin__muted">No sales in window.</p>}
        </section>

        {/* Coupon usage */}
        <section className="od-card">
          <h2 className="od-card__title">Coupon usage</h2>
          {r.coupons.length ? r.coupons.map((c) => (
            <div key={c.code} className="od-line"><span className="admin__mono">{c.code}</span><span className="admin__muted">{c.redemptions}×</span><span className="admin__mono">−{inr(c.discountGiven)}</span></div>
          )) : <p className="admin__muted">No coupons used.</p>}
        </section>
      </div>

      <div className="od-grid">
        {/* Repeat rate */}
        <section className="od-card">
          <h2 className="od-card__title">Customers</h2>
          <div className="ash-metrics__row">
            <KpiCard label="Buyers" value={String(r.customers.total)} href={dCustomers?.href} tooltip={buyersTip} />
            <KpiCard label="Returning" value={String(r.customers.returning)} tooltip="Customers with 2+ paid orders (lifetime)" />
            <KpiCard label="Repeat rate" value={`${r.customers.repeatRate}%`} tooltip="Returning ÷ total buyers" />
          </div>
        </section>

        {/* Orders by state */}
        <section className="od-card">
          <h2 className="od-card__title">Orders by state</h2>
          {r.ordersByState.length ? r.ordersByState.slice(0, 12).map((s) => (
            <div key={s.state} className="od-line"><span>{s.state}</span><span className="admin__muted">{s.orders} orders</span><span className="admin__mono">{inr(s.revenue)}</span></div>
          )) : <p className="admin__muted">No orders in window.</p>}
        </section>
      </div>
      </>) : null}

      {/* Fragrance performance (R12) */}
      <section className="ash-metrics">
        <div className="ash-activity__head"><h2 className="ash-jump__title">Fragrance performance</h2><span className="admin__muted">by revenue · units · return rate</span></div>
        {fragrances == null ? sectionError : fragrances.length ? (
          <>
            <div className="ash-metrics__row" style={{ marginBottom: 12 }}>
              {bestFrag ? <div className="ash-metric"><span className="ash-metric__v">{bestFrag.family}</span><span className="ash-metric__l">Best seller · {inr(bestFrag.revenue)}</span></div> : null}
              {worstFrag ? <div className="ash-metric"><span className="ash-metric__v">{worstFrag.family}</span><span className="ash-metric__l">Weakest · {inr(worstFrag.revenue)}</span></div> : null}
            </div>
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead><tr><th>Fragrance family</th><th>Units</th><th>Revenue</th><th>Returned</th><th>Return rate</th></tr></thead>
                <tbody>
                  {fragrances.map((f) => (
                    <tr key={f.family}><td>{f.family}</td><td className="admin__mono">{f.units}</td><td className="admin__mono">{inr(f.revenue)}</td><td className="admin__mono">{f.returned}</td><td className="admin__mono">{f.returnRate}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="admin__empty">No sales in window.</p>}
      </section>

      {/* Acquisition channels */}
      <section className="ash-metrics">
        <div className="ash-activity__head"><h2 className="ash-jump__title">Acquisition channels</h2><span className="admin__muted">revenue by normalised UTM channel</span></div>
        {channels == null ? sectionError : channels.length ? (
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead><tr><th>Channel</th><th>Orders</th><th>Revenue</th><th>AOV</th><th>Share</th></tr></thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channel}><td>{c.channel}</td><td className="admin__mono">{c.orders}</td><td className="admin__mono">{inr(c.revenue)}</td><td className="admin__mono">{inr(c.aov)}</td><td className="admin__mono">{c.share}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="admin__empty">No orders in window.</p>}
        <p className="cfg-hint">Orders with no UTMs count as “Direct”. Attribution is per-order (last touch).</p>
      </section>

      {/* Retention cohorts (R11) */}
      <section className="ash-metrics">
        <div className="ash-activity__head"><h2 className="ash-jump__title">Retention cohorts</h2><span className="admin__muted">% of each acquisition month that ordered again, by months since</span></div>
        {cohorts == null ? sectionError : cohorts.cohorts.length ? (
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead><tr><th>Cohort</th><th>Buyers</th>{Array.from({ length: cohorts.months + 1 }, (_, k) => <th key={k}>M{k}</th>)}</tr></thead>
              <tbody>
                {cohorts.cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <td className="admin__mono">{c.cohort}</td><td className="admin__mono">{c.size}</td>
                    {c.retention.map((v, k) => <td key={k} className="admin__mono" style={{ background: v > 0 ? `rgba(140,61,47,${Math.min(v / 100, 1) * 0.28})` : undefined }}>{v > 0 ? `${v}%` : "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="admin__empty">No cohorts yet.</p>}
        <p className="cfg-hint">M0 is always 100% (the acquisition month itself); M1+ shows repeat-purchase retention.</p>
      </section>
    </main>
  );
}
