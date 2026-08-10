/**
 * The SINGLE source of truth for analytics chart styling — colours, spacing, grid, axis, legend, tooltip,
 * animation, typography, and sizing. SamorahChart reads everything from here; no chart sets its own
 * colours or geometry. All colours derive from the Samorah admin design tokens (see :root in admin.css).
 */
export const CHART_COLORS = {
  gold: "#c9a96e", // --ad-gold — primary series
  ink: "#1f1a16", // --ink — secondary series / labels
  smoke: "#6b6259", // --smoke — axes + muted text
  hair: "rgba(31, 26, 22, 0.14)", // --ad-hair — grid lines
  green: "#2f6b3c", // positive
  red: "#8a3d2f", // negative / attention
  paper: "#faf7f2", // --paper — surface
} as const;

/** Ordered, on-brand palette for multi-series charts (kept intentionally small). */
export const CHART_SERIES_PALETTE = [CHART_COLORS.gold, CHART_COLORS.ink, CHART_COLORS.green, CHART_COLORS.smoke, CHART_COLORS.red];
export const CHART_GRID = CHART_COLORS.hair;
export const CHART_AXIS = CHART_COLORS.smoke;

/** Named colour tokens a widget can reference via `colorToken` (registry metadata). */
export const CHART_COLOR_TOKENS = { gold: CHART_COLORS.gold, ink: CHART_COLORS.ink, green: CHART_COLORS.green, smoke: CHART_COLORS.smoke, red: CHART_COLORS.red } as const;
export type ChartColorToken = keyof typeof CHART_COLOR_TOKENS;
export function tokenColor(t?: ChartColorToken | null): string | undefined {
  return t ? CHART_COLOR_TOKENS[t] : undefined;
}

/** Colour for the i-th series (explicit series colour wins, else the palette, cycling). */
export function seriesColor(index: number, explicit?: string): string {
  return explicit ?? CHART_SERIES_PALETTE[index % CHART_SERIES_PALETTE.length];
}

/** Everything else — geometry, grid, axis, legend, tooltip, animation, typography, sizing guards. */
export const CHART_THEME = {
  colors: CHART_COLORS,
  palette: CHART_SERIES_PALETTE,
  spacing: { margin: { top: 6, right: 8, left: 0, bottom: 0 } },
  grid: { stroke: CHART_GRID, vertical: false },
  axis: { stroke: CHART_AXIS, tick: { fill: CHART_AXIS, fontSize: 10 }, tickLine: false, yWidth: 44, minTickGap: 24 },
  legend: { fontSize: 10, iconSize: 8, color: CHART_COLORS.smoke, height: 22 },
  tooltip: { fontFamily: "var(--font-sans)", fontSize: 11, border: `1px solid ${CHART_GRID}`, borderRadius: 6, background: CHART_COLORS.paper },
  animation: { enabled: true, durationMs: 400 },
  typography: { fontFamily: "var(--font-sans)", titleFontFamily: "var(--font-serif)" },
  // Responsive guards — charts never render below these; the container gets a scroll rather than
  // squashing into an unreadable size.
  sizing: { defaultHeight: 220, minHeight: 140, minWidth: 240 },
} as const;
