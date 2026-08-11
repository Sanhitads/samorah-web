import { KpiCard } from "@/components/admin/KpiCard";
import { REPORTS_EXEC_KPIS, isReportsKpiEnabled } from "@/lib/reports/reportsRegistry";
import { resolveDrill } from "@/lib/analytics/analyticsRegistry";
import { cacheAgeLabel } from "@/lib/analytics/dataFreshness";
import type { ExecutiveSummary, KpiPair } from "@/services/reportsService";

/**
 * Reports Executive Summary (Stage R2) — the minimal 5-KPI founder-scan strip atop /admin/reports:
 * Revenue · Operating Profit · Margin · Orders · Customers (GST is intentionally NOT here). Composes ONLY
 * the shared `KpiCard`; every value comes from the canonical Financial Engine via `getExecutiveSummary`
 * (no recomputation here), and each drill resolves from the registry's `drillTarget`. Widgets, flags,
 * drill targets, and provenance (owner/source) all live in `reportsRegistry`.
 */
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmt = (format: "inr" | "percent" | "number", v: number) =>
  format === "inr" ? inr(v) : format === "percent" ? `${v}%` : String(Math.round(v));

/** Descriptive tooltips (presentation only — not registry). Combined with the drill destination for parity
 *  with the Analytics KPI tooltips ("what it means · where it goes"). */
const DESCRIPTIONS: Record<string, string> = {
  "reports.revenue": "Net revenue after refunds (ex-GST) for the selected window",
  "reports.operatingProfit": "Revenue − COGS − packaging − courier − gateway fees",
  "reports.margin": "Operating profit ÷ revenue",
  "reports.orders": "Paid orders in the selected window",
  "reports.customers": "Distinct paying customers in the selected window",
};
const tip = (desc: string | undefined, drill: { tooltip: string } | null): string | undefined =>
  desc ? (drill ? `${desc} · ${drill.tooltip}` : desc) : drill?.tooltip;

export function ReportsExecutiveSummary({
  data,
  ordersRange,
  windowLabel,
}: {
  data: ExecutiveSummary;
  ordersRange: string | null; // orders-page ?range value for the window (e.g. "30d"), or null (all time)
  windowLabel: string;
}) {
  const byId: Record<string, KpiPair> = {
    "reports.revenue": data.revenue,
    "reports.operatingProfit": data.operatingProfit,
    "reports.margin": data.margin,
    "reports.orders": data.orders,
    "reports.customers": data.customers,
  };
  const vsWindow = `vs prev ${windowLabel}`;

  const cards = REPORTS_EXEC_KPIS.filter((w) => isReportsKpiEnabled(w.id)).map((w) => {
    const pair = byId[w.id];
    if (!pair) return null;
    const drill = w.drillTarget
      ? resolveDrill(w.drillTarget, w.drillTarget === "orders" && ordersRange ? { range: ordersRange } : undefined)
      : null;
    return (
      <KpiCard
        key={w.id}
        label={w.label}
        value={fmt(w.format, pair.current)}
        current={pair.current}
        previous={pair.previous}
        higherIsBetter={w.higherIsBetter}
        periodLabel={pair.previous != null ? vsWindow : undefined}
        href={drill?.href}
        tooltip={tip(DESCRIPTIONS[w.id], drill)}
      />
    );
  }).filter(Boolean);

  if (!cards.length) return null;

  return (
    <section className="ash-metrics" id="reports-executive-summary" aria-labelledby="reports-exec-title">
      <div className="ash-jump__head">
        <h2 className="ash-jump__title" id="reports-exec-title">Executive summary</h2>
        <span className="admin__muted ash-updated">Updated {cacheAgeLabel(data.freshness.fetchedAtMs)}</span>
      </div>
      <div className="ash-metrics__row">{cards}</div>
    </section>
  );
}
