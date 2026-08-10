import { SamorahChart } from "@/components/admin/SamorahChart";
import { isWidgetEnabled, getWidget } from "@/lib/analytics/analyticsRegistry";
import { tokenColor } from "@/lib/analytics/chartTheme";
import type { AnalyticsSeriesPoint } from "@/services/businessOverviewService";

/**
 * SalesTrends (Milestone 2 · Stage 4) — the trend charts, placed directly below the Revenue KPIs. Uses
 * ONLY SamorahChart, fed the server-aggregated daily series (MV-backed). Each chart's shape (variant,
 * height, legend, animation, colour) is driven by the registry chart metadata — the registry is the
 * source of truth; SalesTrends just binds a series to each declared chart. Independently feature-flagged.
 */
export function SalesTrends({
  series,
  windowLabel,
  ordersRange,
}: {
  series: AnalyticsSeriesPoint[];
  windowLabel: string;
  ordersRange: string | null;
}) {
  const ordersHref = ordersRange ? `/admin/orders?range=${ordersRange}` : "/admin/orders";
  const empty = series.length ? null : "No orders in the selected period";

  const defs = [
    { key: "chart.revenueTrend", title: "Revenue trend", sKey: "revenue", label: "Revenue", format: "inr" as const, href: ordersHref, hint: `Daily paid revenue · ${windowLabel}` },
    { key: "chart.ordersTrend", title: "Orders trend", sKey: "orders", label: "Orders", format: "number" as const, href: ordersHref, hint: `Daily paid orders · ${windowLabel}` },
    { key: "chart.aovTrend", title: "Average order value trend", sKey: "aov", label: "AOV", format: "inr" as const, href: ordersHref, hint: `Revenue ÷ orders per day · ${windowLabel}` },
    { key: "chart.customersTrend", title: "Customers trend", sKey: "customers", label: "Customers", format: "number" as const, href: "/admin/customers", hint: `Distinct paying customers per day · ${windowLabel}` },
  ];

  const charts = defs
    .filter((d) => isWidgetEnabled(d.key))
    .map((d) => {
      const w = getWidget(d.key);
      return (
        <SamorahChart
          key={d.key}
          variant={w?.chartVariant ?? "line"}
          title={d.title}
          data={series}
          xKey="day"
          series={[{ key: d.sKey, label: d.label, color: tokenColor(w?.colorToken) }]}
          format={d.format}
          href={d.href}
          hint={d.hint}
          empty={empty}
          height={w?.defaultHeight}
          showLegend={w?.showLegend}
          animationEnabled={w?.animationEnabled}
          exportName={d.title}
        />
      );
    });

  if (!charts.length) return null;

  return (
    <section className="ash-metrics ash-anchor" id="trends" aria-labelledby="trends-title">
      <h2 className="ash-jump__title" id="trends-title">Sales trends</h2>
      <div className="an-charts">{charts}</div>
    </section>
  );
}
