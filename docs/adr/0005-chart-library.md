# ADR 0005 — Chart library (Recharts) & the SamorahChart wrapper

**Status:** Accepted (Milestone 2 · Stage 4)
*(Numbered `0005` to match the existing `000X` ADR convention; requested as "ADR-005".)*

## Context
Milestone 2 needs charts on `/admin/analytics`. The codebase had **no** chart library — only hand-rolled
CSS/SVG bars + one sparkline. We wanted actionable, on-brand charts without scattering a third-party API
across the app or letting arbitrary colours/geometry creep in.

## Decision
- **Use Recharts**, wrapped by a single `SamorahChart` component; the library is never imported outside it.
- **Exactly five variants** are supported: `line`, `area`, `bar`, `stackedBar`, `donut`.
- All styling flows from one theme, `src/lib/analytics/chartTheme.ts` (colours, spacing, grid, axis,
  legend, tooltip, animation, typography, sizing).

### Why Recharts
- React-native, declarative SVG composition (`<LineChart><Line/></LineChart>`) — fits our component model.
- **Named, tree-shakeable imports** — we pull only the chart families we use (line/area/bar/pie); unused
  families (Radar, Scatter, Treemap, Sankey, Funnel, etc.) are not imported and drop out of the bundle.
- Mature, well-typed, responsive (`ResponsiveContainer`), and supports per-element animation toggles
  (needed for reduced-motion).
- Alternatives considered: Chart.js (canvas, imperative, weaker React fit), visx (powerful but low-level —
  more code to reach parity), nivo (heavier, opinionated theming). Recharts was the best effort/ýquality fit.

### Why it is wrapped by SamorahChart
- One place enforces the design language, the five-variant limit, and the required behaviours: **loading /
  empty / error / responsive (min-size guards) / accessibility / reduced-motion / theme / optional
  drill-down**. Call sites pass data + a variant, never Recharts internals.
- Swapping or upgrading the library later touches one file, not every chart.
- **RSC boundary safety:** props are serializable (e.g. `format="inr"`, not a function) so a server
  component can feed a client chart. (A function prop 500-ed the page during Stage-4 QA; the wrapper's typed
  API prevents that recurring.)

### Supported variants (and why only five)
`line` (trends), `area` (magnitude-over-time), `bar` + `stackedBar` (discrete/compositional counts),
`donut` (share/mix). These cover every analytics need in Milestones 2–4. Capping the set keeps the visual
language coherent, the bundle small, and review easy. A sixth variant is a deliberate ADR change, not an ad-hoc add.

| Chart variant | Current usage | Purpose | Future usage |
|---|---|---|---|
| `line` | AOV trend · Customers trend | A single/multi metric changing over time | Retention, repeat-rate, delivery-time trends |
| `area` | Revenue trend | Emphasise magnitude/volume over time | Cumulative revenue, sessions, inventory value |
| `bar` | Orders trend | Discrete per-period counts, easy comparison | Returns/day, shipments/day, per-courier counts |
| `stackedBar` | — (available, unused) | Compositional counts within each period | Payment mix over time, channel split, status mix |
| `donut` | — (available, unused) | Share/mix of a whole at a point in time | COD vs prepaid, channel share, category/collection mix |

## Performance considerations
- Recharts loads **only on the `/admin/analytics` route** (client charts) — first-load ≈ 234 kB for that
  route; no shared-chunk or storefront impact.
- Chart data is **server-aggregated** (materialized views + RPCs) and cached; charts receive ready arrays,
  no client-side fetching or aggregation.
- Animations are short (`CHART_THEME.animation.durationMs`) and disabled under reduced-motion.

## Accessibility considerations
- Each chart canvas is `role="img"` with a descriptive `aria-label`; loading uses `aria-busy` + visually-
  hidden text; errors use `role="alert"`.
- **Keyboard drill-down** is the header arrow link (focusable); the clickable canvas is a mouse-only
  convenience that never removes the keyboard path.
- Colours come from the token palette with sufficient contrast; motion respects `prefers-reduced-motion`.

## Future extension guidelines
- New variant → update `ChartVariant` + `SamorahChart` + this ADR. Never import Recharts elsewhere.
- New styling → add to `chartTheme.ts`; never inline colours/geometry in a chart call site.
- **Export (Stage 6, documented only):** charts expose `[data-export-name]` on the SVG canvas. Export will
  add `chartToPng(svg)` (serialize SVG → `<canvas>` → PNG), `chartToPdf()` (embed via `@react-pdf/renderer`),
  and a "Reporting" collector that walks `[data-export-name]` nodes — with **no** SamorahChart call-site
  changes (the contract is the canvas hook + existing variant/series props).
