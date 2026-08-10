"use client";
import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { CHART_THEME, seriesColor } from "@/lib/analytics/chartTheme";

/**
 * SamorahChart (Milestone 2 · Stage 4) — the ONE analytics chart component. Wraps Recharts internally
 * (never exposed) behind a small variant API. Every chart supports loading / empty / error / responsive
 * (with min-size guards) / accessibility / reduced-motion / theme-consistency / optional drill-down.
 * All styling comes from CHART_THEME — charts never set their own colours or geometry.
 *
 * FUTURE EXPORT API (documentation only — not implemented in Stage 4):
 *   Charts render a single SVG inside `.an-chart__canvas[data-export-name]`. A later Export stage (Stage 6)
 *   will add: (a) `exportName` (present now) as the file/label; (b) a `forwardRef` exposing the SVG node;
 *   (c) a `chartToPng(svg)` util (serialize SVG → <canvas> → PNG blob) and `chartToPdf()` (embed the PNG /
 *   SVG via @react-pdf/renderer); (d) a "Reporting" collector that walks all `[data-export-name]` nodes on
 *   the page. No SamorahChart call site changes when that lands — the contract is the `data-export-name`
 *   canvas + the variant/series props already here.
 */
export type ChartVariant = "line" | "area" | "bar" | "stackedBar" | "donut";
export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
}
export interface SamorahChartProps {
  variant: ChartVariant;
  title: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: ChartSeries[];
  height?: number;
  loading?: boolean;
  error?: string | null;
  /** Source-specific empty message; when set (or data is empty) the empty state renders. */
  empty?: string | null;
  /** y-axis / tooltip value format — a SERIALIZABLE key (no functions across the RSC boundary). */
  format?: "number" | "inr" | "percent";
  /** Optional drill-down target — renders the arrow link AND makes the canvas clickable (mouse). */
  href?: string | null;
  /** Short actionable subtitle. */
  hint?: string;
  showLegend?: boolean;
  /** Overrides the theme animation default; reduced-motion always wins. */
  animationEnabled?: boolean;
  /** Stable name for future PNG/PDF export (reserved). */
  exportName?: string;
}

function formatter(kind: SamorahChartProps["format"]): (v: number) => string {
  switch (kind) {
    case "inr":
      return (v) => `₹${Math.round(v).toLocaleString("en-IN")}`;
    case "percent":
      return (v) => `${v}%`;
    default:
      return (v) => Number(v).toLocaleString("en-IN");
  }
}

const shortDay = (v: string | number) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

function Frame({ title, href, hint, children }: { title: string; href?: string | null; hint?: string; children: ReactNode }) {
  return (
    <div className="an-chart">
      <div className="an-chart__head">
        <h3 className="an-chart__title">{title}</h3>
        {href ? <Link href={href} className="an-chart__link" aria-label={`Open ${title} details`}>→</Link> : null}
      </div>
      {hint ? <p className="admin__muted an-chart__hint">{hint}</p> : null}
      {children}
    </div>
  );
}

export function SamorahChart(props: SamorahChartProps) {
  const { variant, title, data, xKey, series, loading, error, empty, format, href, hint, showLegend, animationEnabled, exportName } = props;
  const router = useRouter();
  const reduce = useReducedMotion();
  const animate = animationEnabled !== false && !reduce; // reduced-motion always wins
  const fmt = formatter(format);
  const height = Math.max(props.height ?? CHART_THEME.sizing.defaultHeight, CHART_THEME.sizing.minHeight);
  const t = CHART_THEME;

  if (loading) {
    return (
      <Frame title={title} href={href} hint={hint}>
        <div className="an-chart__skel" style={{ height }} aria-busy="true"><span className="visually-hidden">Loading {title}</span></div>
      </Frame>
    );
  }
  if (error) {
    return (
      <Frame title={title} href={href} hint={hint}>
        <p className="an-chart__state admin__muted" role="alert">{error}</p>
      </Frame>
    );
  }
  if (empty || !data.length) {
    return (
      <Frame title={title} href={href} hint={hint}>
        <p className="an-chart__state admin__muted">{empty ?? "No data in the selected period"}</p>
      </Frame>
    );
  }

  const axisProps = { stroke: t.axis.stroke, tick: t.axis.tick, tickLine: t.axis.tickLine, axisLine: { stroke: t.grid.stroke } };
  const legend = showLegend ? <Legend iconSize={t.legend.iconSize} wrapperStyle={{ fontSize: t.legend.fontSize, color: t.legend.color }} /> : null;
  const tooltip = (
    <Tooltip
      formatter={(value, name) => [fmt(Number(value)), name]}
      labelFormatter={variant === "donut" ? undefined : (label) => shortDay(label as string | number)}
      contentStyle={{ ...t.tooltip }}
    />
  );

  const ariaLabel = `${variant} chart — ${title}${hint ? ": " + hint : ""}`;

  let chart: ReactElement;
  if (variant === "donut") {
    const valueKey = series[0]?.key ?? "value";
    chart = (
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={xKey} innerRadius="58%" outerRadius="82%" paddingAngle={2} isAnimationActive={animate} stroke={t.colors.paper}>
          {data.map((_, i) => <Cell key={i} fill={seriesColor(i)} />)}
        </Pie>
        {legend}
        {tooltip}
      </PieChart>
    );
  } else if (variant === "area") {
    chart = (
      <AreaChart data={data} margin={t.spacing.margin}>
        <CartesianGrid stroke={t.grid.stroke} vertical={t.grid.vertical} />
        <XAxis dataKey={xKey} tickFormatter={shortDay} {...axisProps} minTickGap={t.axis.minTickGap} />
        <YAxis tickFormatter={(v) => fmt(Number(v))} width={t.axis.yWidth} {...axisProps} />
        {tooltip}{legend}
        {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={seriesColor(i, s.color)} fill={seriesColor(i, s.color)} fillOpacity={0.12} strokeWidth={2} isAnimationActive={animate} animationDuration={t.animation.durationMs} />)}
      </AreaChart>
    );
  } else if (variant === "bar" || variant === "stackedBar") {
    chart = (
      <BarChart data={data} margin={t.spacing.margin}>
        <CartesianGrid stroke={t.grid.stroke} vertical={t.grid.vertical} />
        <XAxis dataKey={xKey} tickFormatter={shortDay} {...axisProps} minTickGap={t.axis.minTickGap} />
        <YAxis tickFormatter={(v) => fmt(Number(v))} width={t.axis.yWidth} {...axisProps} />
        {tooltip}{legend}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} stackId={variant === "stackedBar" ? "a" : undefined} fill={seriesColor(i, s.color)} radius={variant === "stackedBar" ? undefined : [2, 2, 0, 0]} isAnimationActive={animate} animationDuration={t.animation.durationMs} />)}
      </BarChart>
    );
  } else {
    chart = (
      <LineChart data={data} margin={t.spacing.margin}>
        <CartesianGrid stroke={t.grid.stroke} vertical={t.grid.vertical} />
        <XAxis dataKey={xKey} tickFormatter={shortDay} {...axisProps} minTickGap={t.axis.minTickGap} />
        <YAxis tickFormatter={(v) => fmt(Number(v))} width={t.axis.yWidth} {...axisProps} />
        {tooltip}{legend}
        {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={seriesColor(i, s.color)} strokeWidth={2} dot={false} isAnimationActive={animate} animationDuration={t.animation.durationMs} />)}
      </LineChart>
    );
  }

  const canvasClick = href ? () => router.push(href) : undefined;
  return (
    <Frame title={title} href={href} hint={hint}>
      <div
        className={`an-chart__canvas${href ? " an-chart__canvas--link" : ""}`}
        role="img"
        aria-label={ariaLabel}
        data-export-name={exportName ?? title}
        onClick={canvasClick}
        style={{ height, minHeight: t.sizing.minHeight, minWidth: t.sizing.minWidth }}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={t.sizing.minWidth} minHeight={t.sizing.minHeight}>{chart}</ResponsiveContainer>
      </div>
    </Frame>
  );
}
