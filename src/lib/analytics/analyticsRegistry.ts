/**
 * Analytics Widget Registry — the SINGLE source of truth for every analytics widget. Each entry declares
 * its identity, owning domain + service (reuse traceability — no duplicate services), RBAC capability,
 * feature flag + default, drill-down route, refresh cadence, data source, visibility, and layout metadata
 * (displayOrder / defaultSize) so a future customisation UI can be built without touching widgets.
 *
 * Components/services are referenced by string keys here (resolved where rendered) so this module stays a
 * pure, importable manifest with no React/DB dependencies. Widgets are wired into pages stage-by-stage;
 * their presence here does NOT mean they are rendered yet.
 */
import type { Capability } from "@/lib/auth/capabilities";
import { resolveFlag } from "@/lib/analytics/featureFlags";

export type WidgetSize = "sm" | "md" | "lg" | "full";
export type WidgetVisibility = "always" | "whenAvailable"; // whenAvailable → degrade/hide if source down
/** Owning business domain — for grouping, ownership, and future department dashboards. */
export type AnalyticsDomain = "Business" | "Operations" | "Marketing" | "Finance" | "Customer" | "Inventory" | "System";
export type AnalyticsSource =
  | "orders"
  | "ga4"
  | "clarity"
  | "razorpay"
  | "inventory"
  | "customers"
  | "coupons"
  | "search"
  | "derived";

// ── Drill-down targets — the SINGLE source of truth for analytics navigation (routes + tooltips). ──
// Executive Summary cards, charts, and lower KPI cards all resolve their destination from here; no
// component defines a route string inline. Adding a destination = one entry here.
export const ANALYTICS_DRILL_TARGETS = {
  orders:          { route: "/admin/orders",                  tooltip: "View Orders",                     isExternal: false },
  ordersAwaiting:  { route: "/admin/orders?awaiting=1",       tooltip: "View orders awaiting fulfilment", isExternal: false },
  ordersCancelled: { route: "/admin/orders?status=cancelled", tooltip: "View cancelled orders",           isExternal: false },
  inventory:       { route: "/admin/inventory",               tooltip: "Open Inventory",                  isExternal: false },
  customers:       { route: "/admin/customers",               tooltip: "View Customers",                  isExternal: false },
  returns:         { route: "/admin/returns",                 tooltip: "View Returns",                    isExternal: false },
  products:        { route: "/admin/products",                tooltip: "View Products",                   isExternal: false },
  shipments:       { route: "/admin/shipments",               tooltip: "Open Shipment board",             isExternal: false },
  fulfillment:     { route: "/admin/fulfillment",             tooltip: "Open Fulfilment board",           isExternal: false },
  reports:         { route: "/admin/reports",                 tooltip: "Open Reports",                    isExternal: false },
  search:          { route: "/admin/search",                  tooltip: "Open Search",                     isExternal: false },
} as const;

/** Strongly-typed drill key — derived from the map so it can never drift from the routes. */
export type DrillTargetKey = keyof typeof ANALYTICS_DRILL_TARGETS;

/**
 * Lifecycle status for each drill destination — ARCHITECTURAL METADATA ONLY. Never rendered, never affects
 * routing (`resolveDrill` ignores it). It prevents dead routes: a target unreferenced by any widget must be
 * explicitly `reserved` (defined for a future capability) or `deprecated` (kept temporarily for back-compat),
 * never silently orphaned. The `Record<DrillTargetKey, …>` type forces every target to declare a status at
 * compile time, so a newly-added destination can never skip this governance.
 *   active     — currently used by ≥1 widget (Analytics and/or Reports)
 *   reserved   — intentionally defined for a future capability, not yet wired to a widget
 *   deprecated — retained temporarily for backwards compatibility
 */
export type DrillTargetStatus = "active" | "reserved" | "deprecated";
export const DRILL_TARGET_STATUS: Record<DrillTargetKey, { status: DrillTargetStatus; reason?: string }> = {
  orders:          { status: "active" },
  ordersAwaiting:  { status: "active" },
  inventory:       { status: "active" },
  customers:       { status: "active" },
  products:        { status: "active" },
  ordersCancelled: { status: "reserved", reason: "Cancelled-orders drill; defined but not yet wired to a widget." },
  returns:         { status: "reserved", reason: "Returns board destination; not yet referenced by a widget." },
  shipments:       { status: "reserved", reason: "Shipment board destination; not yet referenced by a widget." },
  fulfillment:     { status: "reserved", reason: "Fulfilment board destination; not yet referenced by a widget." },
  reports:         { status: "reserved", reason: "Reports page link-out; not a widget drill target." },
  search:          { status: "reserved", reason: "Search destination; not yet referenced by a widget." },
};

export interface DrillResolution {
  href: string;
  tooltip: string;
  isExternal: boolean; // future: external console link-outs (GA4/Clarity) — false for all Stage-5 targets
  analyticsContext: Record<string, string>; // future: drill-event logging / passthrough — the params echoed
}

/**
 * Resolve a drill target to a concrete link. `params` (contextual filters like the current window) are
 * merged into the destination's query and echoed in `analyticsContext`. `isExternal` is reserved for
 * future console link-outs (false today). Unknown key → null.
 *
 * @example
 * resolveDrill("orders", { range: "30d" })
 * // → {
 * //   href: "/admin/orders?range=30d",
 * //   tooltip: "View Orders",
 * //   isExternal: false,
 * //   analyticsContext: { range: "30d" },
 * // }
 */
export function resolveDrill(key: DrillTargetKey, params?: Record<string, string>): DrillResolution | null {
  const target = ANALYTICS_DRILL_TARGETS[key];
  if (!target) return null;
  const [path, existingQs = ""] = target.route.split("?");
  const sp = new URLSearchParams(existingQs);
  for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
  const qs = sp.toString();
  return { href: qs ? `${path}?${qs}` : path, tooltip: target.tooltip, isExternal: target.isExternal, analyticsContext: { ...(params ?? {}) } };
}

export interface AnalyticsWidget {
  key: string; // unique id + default feature-flag name
  name: string; // display name
  domain: AnalyticsDomain; // owner/domain
  component: string; // component key (resolved by the rendering layer)
  featureFlag: string;
  defaultEnabled: boolean;
  permission: Capability;
  service: string; // owning existing service (reuse traceability)
  isDrillable: boolean; // does clicking navigate? (derived from drillTarget unless set explicitly)
  drillTarget?: DrillTargetKey; // destination — resolved via resolveDrill (single source of truth)
  drillDescription?: string; // optional tooltip override
  refreshIntervalMs: number | null; // null → manual refresh only
  dataSource: AnalyticsSource;
  visibility: WidgetVisibility;
  displayOrder: number;
  defaultSize: WidgetSize;
  stage: 1 | 2 | 3 | 4 | 5 | 6 | 7; // Milestone-2 stage that delivers it
  // ── Chart-widget metadata (Stage 4) — optional; only chart.* widgets declare these. Metadata only. ──
  chartVariant?: "line" | "area" | "bar" | "stackedBar" | "donut";
  defaultHeight?: number;
  showLegend?: boolean;
  animationEnabled?: boolean;
  colorToken?: "gold" | "ink" | "green" | "smoke" | "red";
}

const w = (o: Omit<AnalyticsWidget, "featureFlag" | "defaultEnabled" | "isDrillable"> & { featureFlag?: string; defaultEnabled?: boolean; isDrillable?: boolean }): AnalyticsWidget => ({
  featureFlag: o.featureFlag ?? o.key,
  defaultEnabled: o.defaultEnabled ?? true,
  isDrillable: o.isDrillable ?? o.drillTarget != null, // drillable iff it declares a target
  ...o,
});

/** All analytics widgets. Ordered by (stage, displayOrder). */
export const ANALYTICS_WIDGETS: AnalyticsWidget[] = [
  // ── Stage 2 · Executive Summary ──
  // Order = founder scan order (revenue → orders → AOV → traffic → conversion → product → ops → risk).
  w({ key: "exec.revenue", name: "Revenue Today", domain: "Finance", component: "KpiCard", permission: "analytics.view", service: "commandCenterService", drillTarget: "orders", refreshIntervalMs: 300_000, dataSource: "orders", visibility: "always", displayOrder: 1, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.orders", name: "Orders Today", domain: "Business", component: "KpiCard", permission: "analytics.view", service: "businessOverviewService", drillTarget: "orders", refreshIntervalMs: 300_000, dataSource: "orders", visibility: "always", displayOrder: 2, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.aov", name: "Average Order Value", domain: "Finance", component: "KpiCard", permission: "analytics.view", service: "businessOverviewService", drillTarget: "orders", refreshIntervalMs: 300_000, dataSource: "orders", visibility: "always", displayOrder: 3, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.visitors", name: "Visitors Today", domain: "Marketing", component: "KpiCard", permission: "analytics.view", service: "ga4DataService", refreshIntervalMs: 120_000, dataSource: "ga4", visibility: "whenAvailable", displayOrder: 4, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.conversion", name: "Conversion Rate", domain: "Marketing", component: "KpiCard", permission: "analytics.view", service: "ga4DataService", refreshIntervalMs: 120_000, dataSource: "ga4", visibility: "whenAvailable", displayOrder: 5, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.bestSeller", name: "Best Seller", domain: "Business", component: "KpiCard", permission: "analytics.view", service: "businessOverviewService", drillTarget: "products", refreshIntervalMs: 300_000, dataSource: "orders", visibility: "always", displayOrder: 6, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.pending", name: "Awaiting Fulfilment", domain: "Operations", component: "KpiCard", permission: "analytics.view", service: "businessOverviewService", drillTarget: "ordersAwaiting", refreshIntervalMs: 300_000, dataSource: "orders", visibility: "always", displayOrder: 7, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.criticalAlerts", name: "Critical Alerts", domain: "Operations", component: "KpiCard", permission: "analytics.view", service: "commandCenterService", drillTarget: "inventory", refreshIntervalMs: 300_000, dataSource: "derived", visibility: "always", displayOrder: 8, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.lowStock", name: "Low Stock Count", domain: "Inventory", component: "KpiCard", permission: "analytics.view", service: "businessOverviewService", drillTarget: "inventory", refreshIntervalMs: 300_000, dataSource: "inventory", visibility: "always", displayOrder: 9, defaultSize: "sm", stage: 2 }),

  // ── Stage 4 · Trend charts (SamorahChart) ──
  w({ key: "chart.revenueTrend", name: "Revenue Trend", domain: "Finance", component: "SamorahChart", permission: "analytics.view", service: "analyticsService", drillTarget: "orders", refreshIntervalMs: null, dataSource: "orders", visibility: "always", displayOrder: 1, defaultSize: "lg", stage: 4, chartVariant: "area", defaultHeight: 220, showLegend: false, animationEnabled: true, colorToken: "gold" }),
  w({ key: "chart.ordersTrend", name: "Orders Trend", domain: "Business", component: "SamorahChart", permission: "analytics.view", service: "analyticsService", drillTarget: "orders", refreshIntervalMs: null, dataSource: "orders", visibility: "always", displayOrder: 2, defaultSize: "lg", stage: 4, chartVariant: "bar", defaultHeight: 220, showLegend: false, animationEnabled: true, colorToken: "gold" }),
  w({ key: "chart.customersTrend", name: "Customers Trend", domain: "Customer", component: "SamorahChart", permission: "analytics.view", service: "customerAdminService", drillTarget: "customers", refreshIntervalMs: null, dataSource: "customers", visibility: "always", displayOrder: 3, defaultSize: "lg", stage: 4, chartVariant: "line", defaultHeight: 220, showLegend: false, animationEnabled: true, colorToken: "gold" }),
  w({ key: "chart.aovTrend", name: "Average Order Value Trend", domain: "Finance", component: "SamorahChart", permission: "analytics.view", service: "analyticsService", drillTarget: "orders", refreshIntervalMs: null, dataSource: "orders", visibility: "always", displayOrder: 4, defaultSize: "lg", stage: 4, chartVariant: "line", defaultHeight: 220, showLegend: false, animationEnabled: true, colorToken: "gold" }),

  // ── Stage 6 · Exports ──
  w({ key: "export.print", name: "Print Report", domain: "Business", component: "ExportButton", permission: "data.export", service: "analyticsService", refreshIntervalMs: null, dataSource: "derived", visibility: "always", displayOrder: 1, defaultSize: "sm", stage: 6 }),
  w({ key: "export.excel", name: "Export Excel", domain: "Business", component: "ExportButton", permission: "data.export", service: "analyticsService", refreshIntervalMs: null, dataSource: "derived", visibility: "always", displayOrder: 2, defaultSize: "sm", stage: 6 }),
  w({ key: "export.pdf", name: "Export PDF", domain: "Business", component: "ExportButton", permission: "data.export", service: "analyticsService", refreshIntervalMs: null, dataSource: "derived", visibility: "always", displayOrder: 3, defaultSize: "sm", stage: 6 }),

  // ── Stage 7 · Goals ──
  w({ key: "goals.summary", name: "Business Goals", domain: "Business", component: "GoalProgress", permission: "analytics.view", service: "businessOverviewService", refreshIntervalMs: null, dataSource: "orders", visibility: "whenAvailable", displayOrder: 1, defaultSize: "md", stage: 7 }),

  // ── System widgets (freshness + health) — foundation in Stage 1, surfaced in Stage 3 ──
  w({ key: "system.dataFreshness", name: "Data Freshness", domain: "System", component: "DataFreshnessBar", permission: "analytics.view", service: "clarityService", refreshIntervalMs: null, dataSource: "derived", visibility: "always", displayOrder: 1, defaultSize: "full", stage: 3 }),
  w({ key: "system.analyticsHealth", name: "Analytics Health", domain: "System", component: "AnalyticsHealth", permission: "analytics.view", service: "ga4DataService", refreshIntervalMs: null, dataSource: "derived", visibility: "always", displayOrder: 2, defaultSize: "full", stage: 3 }),
];

const BY_KEY: Record<string, AnalyticsWidget> = Object.fromEntries(ANALYTICS_WIDGETS.map((x) => [x.key, x]));

export function getWidget(key: string): AnalyticsWidget | undefined {
  return BY_KEY[key];
}

export function widgetsForStage(stage: AnalyticsWidget["stage"]): AnalyticsWidget[] {
  return ANALYTICS_WIDGETS.filter((x) => x.stage === stage).sort((a, b) => a.displayOrder - b.displayOrder);
}

export function widgetsForDomain(domain: AnalyticsDomain): AnalyticsWidget[] {
  return ANALYTICS_WIDGETS.filter((x) => x.domain === domain);
}

/** Is a widget currently enabled? Unknown key → false. Respects env feature-flag overrides. */
export function isWidgetEnabled(key: string): boolean {
  const widget = BY_KEY[key];
  if (!widget) return false;
  return resolveFlag(widget.featureFlag, widget.defaultEnabled);
}

/**
 * Analytics SECTIONS — the single source of truth for the page's scrollable sections. Each has a STABLE
 * `id` (matches the `<section id>` anchors + the jump-nav) plus `keywords` so a future command-palette /
 * search can resolve a query to a section without a UI change here. No search UI is built in this stage.
 */
export interface AnalyticsSection {
  id: string; // stable identifier — used for anchors, deep-links, and future search
  label: string;
  keywords: string[]; // future searchable terms
}

export const ANALYTICS_SECTIONS: AnalyticsSection[] = [
  { id: "executive-summary", label: "Summary", keywords: ["executive", "kpi", "today", "overview", "glance"] },
  { id: "business-overview", label: "Overview", keywords: ["business", "ceo", "orders", "revenue", "customers", "payment"] },
  { id: "revenue", label: "Revenue", keywords: ["gross", "net", "refunds", "aov", "sales"] },
  { id: "trends", label: "Trends", keywords: ["chart", "trend", "graph", "revenue", "orders", "customers", "aov"] },
  { id: "fulfillment", label: "Fulfilment", keywords: ["pick", "pack", "dispatch", "sla", "cycle"] },
  { id: "delivery", label: "Delivery", keywords: ["logistics", "rto", "shipping", "exception", "delivery time"] },
  { id: "returns", label: "Returns", keywords: ["refunds", "reasons", "return rate"] },
  { id: "courier", label: "Couriers", keywords: ["shiprocket", "delivery", "performance", "carrier"] },
  { id: "search", label: "Search", keywords: ["queries", "zero result", "search"] },
  { id: "attribution", label: "Attribution", keywords: ["channel", "utm", "instagram", "google", "email", "organic"] },
  { id: "campaigns", label: "Campaigns", keywords: ["utm", "campaign", "source", "medium"] },
  { id: "clarity", label: "Behaviour", keywords: ["clarity", "rage click", "dead click", "scroll", "engagement"] },
  { id: "ga4", label: "GA4", keywords: ["visitors", "sessions", "conversion", "live", "realtime"] },
];

const SECTION_BY_ID: Record<string, AnalyticsSection> = Object.fromEntries(ANALYTICS_SECTIONS.map((s) => [s.id, s]));

export function getSection(id: string): AnalyticsSection | undefined {
  return SECTION_BY_ID[id];
}

/** Sections whose id/label/keywords match a query — the seam a future search UI would call. */
export function searchSections(query: string): AnalyticsSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ANALYTICS_SECTIONS.filter((s) =>
    s.id.includes(q) || s.label.toLowerCase().includes(q) || s.keywords.some((k) => k.includes(q)),
  );
}
