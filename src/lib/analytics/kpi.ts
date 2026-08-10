/**
 * Analytics KPI comparison math (pure, framework-free, fully unit-tested). The single place that turns a
 * current + previous-period value into the {absolute, %, direction, tone} that every KpiCard renders — so
 * "trend" logic is never re-implemented per widget. `higherIsBetter` decides tone independently of the
 * arrow direction (e.g. a rising Return Rate points up but is a BAD tone).
 */
export type KpiDirection = "up" | "down" | "flat";
export type KpiTone = "good" | "bad" | "neutral";

export interface KpiComparison {
  current: number;
  previous: number | null;
  /** current − previous, or null when there is no comparable previous period. */
  absolute: number | null;
  /** rounded % change vs previous, or null when previous is null/zero. */
  pct: number | null;
  direction: KpiDirection;
  tone: KpiTone;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Compare a current value to its previous-period value.
 * @param higherIsBetter true when a rise is good (revenue); false when a rise is bad (returns, refunds).
 */
export function compareKpi(
  current: number,
  previous: number | null | undefined,
  higherIsBetter = true,
): KpiComparison {
  const prev = previous == null || Number.isNaN(previous) ? null : previous;
  if (prev == null) {
    return { current, previous: null, absolute: null, pct: null, direction: "flat", tone: "neutral" };
  }
  const absolute = round1(current - prev);
  const direction: KpiDirection = absolute > 0 ? "up" : absolute < 0 ? "down" : "flat";
  const pct = prev !== 0 ? round1(((current - prev) / Math.abs(prev)) * 100) : null;
  let tone: KpiTone = "neutral";
  if (direction !== "flat") {
    const rose = direction === "up";
    tone = rose === higherIsBetter ? "good" : "bad";
  }
  return { current, previous: prev, absolute, pct, direction, tone };
}

/** Arrow glyph for a direction (matches the dashboard's cc-delta idiom). */
export function trendArrow(direction: KpiDirection): string {
  return direction === "up" ? "▲" : direction === "down" ? "▼" : "—";
}
