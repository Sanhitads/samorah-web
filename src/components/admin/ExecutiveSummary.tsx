import { KpiCard } from "@/components/admin/KpiCard";
import { isWidgetEnabled, getWidget, resolveDrill } from "@/lib/analytics/analyticsRegistry";
import { emptyStateMessage } from "@/lib/analytics/emptyState";
import { cacheAgeLabel } from "@/lib/analytics/dataFreshness";
import type { KpiSnapshot, BusinessOverview } from "@/services/businessOverviewService";
import type { Ga4Insights } from "@/services/ga4DataService";

/**
 * Executive Summary (Milestone 2 · Stage 2, drill-downs centralized in Stage 5) — the at-a-glance KPI
 * strip atop /admin/analytics. Composes ONLY the shared KpiCard from already-fetched services. Every
 * drillable card resolves its destination + tooltip from the registry (`resolveDrill`) — no inline route
 * strings — so KPI cards, charts, and lower tiles stay consistent. Non-drill (GA4) cards stay value-only.
 */
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Registry-resolved drill for a widget (null when the widget isn't drillable). */
function drillFor(key: string, params?: Record<string, string>) {
  const wgt = getWidget(key);
  return wgt?.isDrillable && wgt.drillTarget ? resolveDrill(wgt.drillTarget, params) : null;
}
/** Combine a card's descriptive tooltip with its destination ("… · View Orders"). */
const tip = (desc: string, drill: { tooltip: string } | null) => (drill ? `${desc} · ${drill.tooltip}` : desc);

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

  const dRev = drillFor("exec.revenue", { range: "today" });
  const dOrd = drillFor("exec.orders", { range: "today" });
  const dAov = drillFor("exec.aov", ordersRange ? { range: ordersRange } : undefined);
  const dBest = drillFor("exec.bestSeller");
  const dPend = drillFor("exec.pending");
  const dCrit = drillFor("exec.criticalAlerts");
  const dLow = drillFor("exec.lowStock");

  const cards = [
    isWidgetEnabled("exec.revenue") && (
      <KpiCard key="rev" label="Revenue Today" value={inr(kpi.revenueToday.current)} current={kpi.revenueToday.current} previous={kpi.revenueToday.previous} periodLabel="vs yesterday" tooltip={tip("Paid revenue placed today vs yesterday", dRev)} href={dRev?.href} sparkline={revenueSpark.length > 1 ? revenueSpark : null} />
    ),
    isWidgetEnabled("exec.orders") && (
      <KpiCard key="ord" label="Orders Today" value={String(kpi.ordersToday.current)} current={kpi.ordersToday.current} previous={kpi.ordersToday.previous} periodLabel="vs yesterday" tooltip={tip("Paid orders placed today vs yesterday", dOrd)} href={dOrd?.href} />
    ),
    isWidgetEnabled("exec.aov") && (
      <KpiCard key="aov" label="Average Order Value" value={inr(kpi.avgBasket.current)} current={kpi.avgBasket.current} previous={kpi.avgBasket.previous} periodLabel={vsWindow} tooltip={tip("Revenue ÷ paid orders in the selected window", dAov)} href={dAov?.href} />
    ),
    isWidgetEnabled("exec.visitors") && (
      <KpiCard key="vis" label="Visitors (live)" value={ga4.available ? String(ga4.activeUsers ?? 0) : "—"} periodLabel={ga4.available ? "last 30 min" : undefined} tooltip="GA4 active users in the last 30 minutes" empty={ga4Empty} />
    ),
    isWidgetEnabled("exec.conversion") && (
      <KpiCard key="cvr" label="Conversion (7d)" value={ga4.available && ga4.conversionRate != null ? `${ga4.conversionRate}%` : "—"} periodLabel={ga4.available ? "last 7 days" : undefined} tooltip="GA4 conversions ÷ sessions, last 7 days" empty={ga4Empty} />
    ),
    isWidgetEnabled("exec.bestSeller") && (
      <KpiCard key="best" label={`Best Seller (${windowLabel})`} value={best ? best.name : "—"} periodLabel={best ? `${best.units} units · ${inr(best.revenue)}` : undefined} empty={best ? null : emptyStateMessage("orders", "no_data", windowLabel)} tooltip={tip(`Top product by units sold over the ${windowLabel} window`, dBest)} href={dBest?.href} />
    ),
    isWidgetEnabled("exec.pending") && (
      <KpiCard key="pend" label="Awaiting Fulfilment" value={String(overview.window.pending)} tone={overview.window.pending ? "warn" : "plain"} tooltip={tip("Paid orders confirmed / processing / packed — awaiting shipment", dPend)} href={dPend?.href} />
    ),
    isWidgetEnabled("exec.criticalAlerts") && (
      <KpiCard key="crit" label="Critical Alerts" value={String(overview.inventory.outOfStock)} tone={overview.inventory.outOfStock ? "warn" : "plain"} tooltip={tip("Out-of-stock SKUs (can oversell) — critical", dCrit)} href={dCrit?.href} />
    ),
    isWidgetEnabled("exec.lowStock") && (
      <KpiCard key="low" label="Low Stock Count" value={String(overview.inventory.lowStock)} tone={overview.inventory.lowStock ? "warn" : "plain"} tooltip={tip("Active SKUs at/below their low-stock threshold", dLow)} href={dLow?.href} />
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
