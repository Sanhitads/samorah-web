# Samorah Analytics — Product Roadmap

Single source of truth for the Analytics product vision. **Milestone 2 (Analytics Polish) is the only
milestone under active development.** Milestones 3–5 are vision-only — no implementation begins without
explicit approval.

---

## Milestone 2 — Production Ready · Status: FROZEN

**Analytics Milestone 2 (Analytics Polish) is Production Ready and FROZEN.** Stages 1–5 are delivered,
verified, and committed on `replatform/nextjs` (Stage 1 `899a828` · Stage 2 `11ce139` · Stage 3 `772cc0e`
· Stage 4 `25d27c7` · Stage 5 Drill-downs Commit 1 `8082f11`). No further Analytics work — including
Stage 5 Commit 2, Stage 6, or Stage 7 — begins without an **explicit milestone reopening**.

### Launch Scope

**Included in Launch (ships day one)**
- Foundation: `KpiCard` primitive + SQL/RPC + materialized-view data layer (server-side aggregation).
- Executive Dashboard: founder-scan KPIs with previous/Δ/%/trend/sparkline/tooltips and source-specific empty states.
- Navigation & Filters: sticky date selector, section jump-links, refresh (pending state), last-updated + data-freshness bar.
- Charts: four trend charts via the single `SamorahChart` wrapper (Recharts, route-scoped to `/admin/analytics`).
- Drill-downs (Commit 1): registry-driven, context-preserving links for Business Overview / Revenue / Returns / Inventory / Fulfillment / Shipments.
- Governance baked in: per-widget feature flags, RBAC (`analytics.view` / `data.export`), automated MV refresh cron, honest external-source degradation.

**Deferred Until Post-launch (optional — requires milestone reopening)**
- Stage 5 **Commit 2** — Search / Attribution / Campaigns drill-downs (only if operationally valuable).
- Stage 6 **Exports** — Print / Excel (`exceljs`) / PDF (`@react-pdf/renderer`).
- Stage 7 **Goals** — optional business goals with progress tracking.

### Architecture Index

Primary reference documents for future developers:
- **Analytics Roadmap** — `docs/roadmaps/ANALYTICS_ROADMAP.md` (this file)
- **ADR 0001 — RPC Foundation / versioning** — `docs/adr/0001-analytics-rpc-versioning.md`
- **ADR 0002 — Materialized-view strategy** — `docs/adr/0002-materialized-view-strategy.md`
- **ADR 0003 — Registry Architecture** — `docs/adr/0003-analytics-registry.md`
- **ADR 0004 — Cache strategy** — `docs/adr/0004-analytics-cache-strategy.md`
- **ADR 0005 — Chart Architecture** — `docs/adr/0005-chart-library.md`
- **Registry (source of truth)** — `src/lib/analytics/analyticsRegistry.ts`

---

## Standing engineering rules (all milestones)
- Reuse existing server-side services (`analyticsService`, `businessOverviewService`, `reportsService`,
  `marketingAnalyticsService`, `customerAdminService`, `commandCenterService`, `ga4DataService`,
  `clarityService`, `couponAnalyticsService`). **No duplicate services / queries / calculations / components.**
- **Prefer SQL RPCs and materialized views over JavaScript aggregation** wherever beneficial. Server-side
  aggregation only; no unbounded fetches or large client-side scans.
- Maintain RBAC (`analytics.view` / `data.export`), accessibility, responsive behaviour, and the existing
  Samorah luxury design language. **Do not redesign the Analytics page.**
- Every new widget is **feature-flagged** (independently enable/disable without deploy), declared in the
  central `analyticsRegistry`, and degrades with **source-specific** empty/error states (never generic "No Data").
- Every external/cached source shows **Last Updated · Cache Age · Availability**.
- Tests for every calculation, transformation, RPC, and KPI.

## Milestone 2 — Analytics Polish (ACTIVE) — fixed stage order
1. **Foundation** — ✅ **COMPLETED** (`899a828`) — shared `KpiCard`; SQL aggregation / RPCs / materialized
   views; previous-period calculations; caching; pagination; performance optimisation; the central
   `analyticsRegistry`, feature flags, data-freshness, source-specific empty states, ops-log +
   analytics-health foundations. *Everything after Stage 1 consumes this optimized data layer.*
2. **Executive Dashboard** — ✅ **COMPLETED** (`11ce139`) — Executive Summary using optimized services;
   every KPI shows current / previous / difference / % / trend arrow / tooltip / optional mini-sparkline /
   date range; graceful source-specific empty states; context-preserving drill-downs.
3. **Navigation & Filters** — ✅ **COMPLETED** — sticky nav + sticky date selector; smooth scrolling;
   section jump links (registry-backed stable ids); remember last range (versioned saved-filter store);
   refresh controls (manual w/ pending spinner + auto) + last-updated; data-freshness indicators;
   Saved-Filter *architecture only* — `AnalyticsFilterState` designed for future URL sync (window /
   section / filters / custom), no DB for saved views this milestone.
4. **Charts** — ✅ **COMPLETED** — one `SamorahChart` (variants: line, area, bar, stackedBar, donut; wraps
   Recharts, never exposed — see ADR 0005). Revenue / Orders / AOV / Customers trends below the Revenue KPIs;
   registry-driven chart metadata; single `chartTheme` source of truth; loading/empty/error/responsive/a11y/
   reduced-motion/drill-down. (365 + custom range remain with the Stage-3 date selector — deferred.)
5. **Drill-downs** — ⭐ **NEXT** — every KPI navigates to the existing admin page (normal / middle / ctrl-click).
6. **Exports** — Print (`@media print` + `window.print()`), Excel (`exceljs`), PDF (`@react-pdf/renderer`);
   every export includes Generated By / Generated At / Date Range / Applied Filters. Reuse `data.export`.
7. **Goals** — optional business goals (revenue, orders, AOV, returns, refunds, cancellation rate,
   inventory) with current / target / % / progress; hide gracefully when unconfigured.

**Verification gate:** after EVERY stage, produce the 22-item verification report and STOP for approval.

### Approved dependencies (M2)
Charts → **Recharts** (wrapped in `SamorahChart`). Excel → **exceljs**. PDF → **@react-pdf/renderer**.
Print → native (no dependency).

## Milestone 3 — Post-launch (1–3 months) — VISION ONLY
Customer Analytics Enhancements · Inventory Intelligence · Product Intelligence · Search Intelligence ·
Smart Alerts · Scheduled Reports · Dashboard Personalization.

## Milestone 4 — Growth (3–6 months) — VISION ONLY
Marketing Attribution · Geographic Analytics · Payment Analytics · Discount Analytics · Advanced Clarity Insights.

## Milestone 5 — Enterprise — VISION ONLY (not scheduled)
AI Insights · Forecasting · Demand Prediction · Multi-Store · Multi-Warehouse · Multi-Country · Role-Based
Dashboards · Saved Dashboard Layouts · Custom Widgets · Predictive Inventory · Advanced Customer Segmentation.

## Existing module baseline (do not rebuild)
Already implemented and reused, not rebuilt: revenue/fulfillment/delivery/courier/returns/refunds
(`analyticsService`); CEO glance + COD share + best/worst sellers (`businessOverviewService`); GST/P&L/
fragrance/channel/cohorts (`reportsService`); dashboard v3 with the only period-over-period + sparkline
(`commandCenterService`); search + UTM (`marketingAnalyticsService`); attributed coupon revenue
(`couponAnalyticsService`); live GA4 (`ga4DataService`); Clarity behavioural (`clarityService`); customer
LTV/health/cohorts (`customerAdminService`). CSV export exists (`data.export`). No chart library, no shared
KPI component, and mostly JS-side aggregation existed before Milestone 2.
