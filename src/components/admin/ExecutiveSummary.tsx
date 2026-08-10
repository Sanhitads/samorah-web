import { KpiCard } from "@/components/admin/KpiCard";
import { isWidgetEnabled } from "@/lib/analytics/analyticsRegistry";
import { emptyStateMessage } from "@/lib/analytics/emptyState";
import { cacheAgeLabel } from "@/lib/analytics/dataFreshness";
import type { KpiSnapshot, BusinessOverview } from "@/services/businessOverviewService";
import type { Ga4Insights } from "@/services/ga4DataService";

/**
 * Executive Summary (Milestone 2 · Stage 2) — the at-a-glance KPI strip at the top of /admin/analytics.
 * Composes ONLY the shared KpiCard from already-fetched services (getKpiSnapshot + the page's existing
 * getBusinessOverview + getGa4Insights) — no new queries, no redesign (reuses ash-metrics). Cards are
 * ordered the way a founder scans performance, each independently feature-flagged via the registry and
 * degrading with a source-specific empty state. Drill-downs carry the relevant filter/range so the
 * operator lands on the most relevant view. A section-level "Last updated" (first-party freshness) is
 * shown consistently for the whole strip.
 */
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function ExecutiveSummary({
  kpi,
  overview,
  ga4,
  revenueSpark,
  windowLabel,
  ordersRange,
}: {
  kpi: KpiSnapshot;
  overview: BusinessOverview;
  ga4: Ga4Insights;
  revenueSpark: number[];
  windowLabel: string; // e.g. "30 days" / "all time"
  ordersRange: string | null; // orders-page ?range value for the window (e.g. "30d"), or null (all time)
}) {
  const vsWindow = `vs prev ${windowLabel}`;
  const best = overview.bestSellers[0];
  const ga4Empty = ga4.available ? null : emptyStateMessage("ga4", ga4.error === "not_configured" || !ga4.error ? "not_configured" : "unavailable");
  const ordersForWindow = ordersRange ? `/admin/orders?range=${ordersRange}` : "/admin/orders";

  const cards = [
    isWidgetEnabled("exec.revenue") && (
      <KpiCard key="rev" label="Revenue Today" value={inr(kpi.revenueToday.current)} current={kpi.revenueToday.current} previous={kpi.revenueToday.previous} periodLabel="vs yesterday" tooltip="Paid revenue placed today vs yesterday" href="/admin/orders?range=today" sparkline={revenueSpark.length > 1 ? revenueSpark : null} />
    ),
    isWidgetEnabled("exec.orders") && (
      <KpiCard key="ord" label="Orders Today" value={String(kpi.ordersToday.current)} current={kpi.ordersToday.current} previous={kpi.ordersToday.previous} periodLabel="vs yesterday" tooltip="Paid orders placed today vs yesterday" href="/admin/orders?range=today" />
    ),
    isWidgetEnabled("exec.aov") && (
      <KpiCard key="aov" label="Average Order Value" value={inr(kpi.avgBasket.current)} current={kpi.avgBasket.current} previous={kpi.avgBasket.previous} periodLabel={vsWindow} tooltip="Revenue ÷ paid orders in the selected window" href={ordersForWindow} />
    ),
    isWidgetEnabled("exec.visitors") && (
      <KpiCard key="vis" label="Visitors (live)" value={ga4.available ? String(ga4.activeUsers ?? 0) : "—"} periodLabel={ga4.available ? "last 30 min" : undefined} tooltip="GA4 active users in the last 30 minutes" empty={ga4Empty} />
    ),
    isWidgetEnabled("exec.conversion") && (
      <KpiCard key="cvr" label="Conversion (7d)" value={ga4.available && ga4.conversionRate != null ? `${ga4.conversionRate}%` : "—"} periodLabel={ga4.available ? "last 7 days" : undefined} tooltip="GA4 conversions ÷ sessions, last 7 days" empty={ga4Empty} />
    ),
    isWidgetEnabled("exec.bestSeller") && (
      <KpiCard key="best" label={`Best Seller (${windowLabel})`} value={best ? best.name : "—"} periodLabel={best ? `${best.units} units · ${inr(best.revenue)}` : undefined} empty={best ? null : emptyStateMessage("orders", "no_data", windowLabel)} tooltip={`Top product by units sold over the ${windowLabel} window`} href="/admin/products" />
    ),
    isWidgetEnabled("exec.pending") && (
      <KpiCard key="pend" label="Awaiting Fulfilment" value={String(overview.window.pending)} tone={overview.window.pending ? "warn" : "plain"} tooltip="Paid orders confirmed / processing / packed — awaiting shipment" href="/admin/orders?awaiting=1" />
    ),
    isWidgetEnabled("exec.criticalAlerts") && (
      <KpiCard key="crit" label="Critical Alerts" value={String(overview.inventory.outOfStock)} tone={overview.inventory.outOfStock ? "warn" : "plain"} tooltip="Out-of-stock SKUs (can oversell) — critical" href="/admin/inventory" />
    ),
    isWidgetEnabled("exec.lowStock") && (
      <KpiCard key="low" label="Low Stock Count" value={String(overview.inventory.lowStock)} tone={overview.inventory.lowStock ? "warn" : "plain"} tooltip="Active SKUs at/below their low-stock threshold" href="/admin/inventory" />
    ),
  ].filter(Boolean);

  if (!cards.length) return null;

  return (
    <section className="ash-metrics" id="executive-summary" aria-labelledby="executive-summary-title">
      <div className="ash-jump__head">
        <h2 className="ash-jump__title" id="executive-summary-title">Executive summary</h2>
        <span className="admin__muted ash-updated">Last updated {cacheAgeLabel(kpi.freshness.fetchedAtMs)}</span>
      </div>
      <div className="ash-metrics__row">{cards}</div>
    </section>
  );
}
