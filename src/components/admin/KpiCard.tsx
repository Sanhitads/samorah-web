import Link from "next/link";
import { compareKpi, trendArrow } from "@/lib/analytics/kpi";

/**
 * KpiCard — the ONE shared analytics KPI tile (replaces the ad-hoc `Tile`/`inc-kpi`/`cc-hero` idioms).
 * Server-component friendly: drill-down is a real <a> (Link) so normal / middle / ctrl-click all work,
 * the tooltip is native `title`, and the optional mini-sparkline is inline SVG (no chart library before
 * Stage 4). Reuses the existing `ash-metric` / `cc-delta` design classes — no visual redesign.
 *
 * States: loading skeleton · source-specific empty/error · value(+optional previous-period delta).
 */
export interface KpiCardProps {
  label: string;
  /** Preformatted display value, e.g. "₹42,300". */
  value: string;
  /** Raw current + previous for the delta (optional — omit for a value-only card). */
  current?: number | null;
  previous?: number | null;
  /** A rise is good (revenue) vs bad (returns/refunds). Controls delta colour, not arrow direction. */
  higherIsBetter?: boolean;
  /** "vs yesterday" / "vs prev 30 days". */
  periodLabel?: string;
  tooltip?: string;
  /** Drill-down target; when set the card becomes a link. */
  href?: string | null;
  tone?: "plain" | "warn" | "gold";
  loading?: boolean;
  /** Source-specific empty/error message; when set, renders the empty state instead of a value. */
  empty?: string | null;
  /** Optional mini sparkline series (inline SVG). */
  sparkline?: number[] | null;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 64, h = 18;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / span) * h}`)
    .join(" ");
  return (
    <svg className="kpi__spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function KpiCard(props: KpiCardProps) {
  const { label, value, current, previous, higherIsBetter = true, periodLabel, tooltip, href, tone = "plain", loading, empty, sparkline } = props;

  if (loading) {
    return (
      <div className="ash-metric kpi kpi--loading" aria-busy="true" aria-live="polite">
        <span className="kpi__skel kpi__skel--v" />
        <span className="kpi__skel kpi__skel--l" />
        <span className="visually-hidden">Loading {label}</span>
      </div>
    );
  }

  const hasDelta = current != null && previous != null;
  const cmp = hasDelta ? compareKpi(current as number, previous as number, higherIsBetter) : null;

  const body = (
    <>
      <span className="ash-metric__v" data-tone={tone}>{empty ? "—" : value}</span>
      <span className="ash-metric__l">{label}</span>
      {empty ? (
        <span className="kpi__empty admin__muted">{empty}</span>
      ) : (
        <>
          {cmp && cmp.pct != null ? (
            <span className="cc-delta kpi__delta" data-tone={cmp.tone === "good" ? "up" : cmp.tone === "bad" ? "down" : "flat"}
              aria-label={`${cmp.direction === "up" ? "up" : cmp.direction === "down" ? "down" : "no change"} ${Math.abs(cmp.pct)} percent${periodLabel ? " " + periodLabel : ""}`}>
              {trendArrow(cmp.direction)} {Math.abs(cmp.pct)}%
            </span>
          ) : null}
          {periodLabel ? <span className="kpi__period admin__muted">{periodLabel}</span> : null}
          {sparkline && sparkline.length > 1 ? <Sparkline points={sparkline} /> : null}
        </>
      )}
    </>
  );

  const title = tooltip ?? undefined;

  if (href && !empty) {
    return (
      <Link href={href} className="ash-metric kpi kpi--link" title={title} aria-label={`${label}: ${value}${tooltip ? ". " + tooltip : ""}`}>
        {body}
      </Link>
    );
  }
  return (
    <div className="ash-metric kpi" title={title} aria-label={tooltip ? `${label}: ${value}. ${tooltip}` : undefined}>
      {body}
    </div>
  );
}
