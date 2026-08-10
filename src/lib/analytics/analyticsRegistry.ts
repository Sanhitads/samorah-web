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

export interface AnalyticsWidget {
  key: string; // unique id + default feature-flag name
  name: string; // display name
  domain: AnalyticsDomain; // owner/domain
  component: string; // component key (resolved by the rendering layer)
  featureFlag: string;
  defaultEnabled: boolean;
  permission: Capability;
  service: string; // owning existing service (reuse traceability)
  route: string | null; // drill-down target
  refreshIntervalMs: number | null; // null → manual refresh only
  dataSource: AnalyticsSource;
  visibility: WidgetVisibility;
  displayOrder: number;
  defaultSize: WidgetSize;
  stage: 1 | 2 | 3 | 4 | 5 | 6 | 7; // Milestone-2 stage that delivers it
}

const w = (o: Omit<AnalyticsWidget, "featureFlag" | "defaultEnabled"> & { featureFlag?: string; defaultEnabled?: boolean }): AnalyticsWidget => ({
  featureFlag: o.featureFlag ?? o.key,
  defaultEnabled: o.defaultEnabled ?? true,
  ...o,
});

/** All analytics widgets. Ordered by (stage, displayOrder). */
export const ANALYTICS_WIDGETS: AnalyticsWidget[] = [
  // ── Stage 2 · Executive Summary ──
  // Order = founder scan order (revenue → orders → AOV → traffic → conversion → product → ops → risk).
  w({ key: "exec.revenue", name: "Revenue Today", domain: "Finance", component: "KpiCard", permission: "analytics.view", service: "commandCenterService", route: "/admin/orders", refreshIntervalMs: 300_000, dataSource: "orders", visibility: "always", displayOrder: 1, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.orders", name: "Orders Today", domain: "Business", component: "KpiCard", permission: "analytics.view", service: "businessOverviewService", route: "/admin/orders", refreshIntervalMs: 300_000, dataSource: "orders", visibility: "always", displayOrder: 2, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.aov", name: "Average Order Value", domain: "Finance", component: "KpiCard", permission: "analytics.view", service: "businessOverviewService", route: "/admin/orders", refreshIntervalMs: 300_000, dataSource: "orders", visibility: "always", displayOrder: 3, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.visitors", name: "Visitors Today", domain: "Marketing", component: "KpiCard", permission: "analytics.view", service: "ga4DataService", route: null, refreshIntervalMs: 120_000, dataSource: "ga4", visibility: "whenAvailable", displayOrder: 4, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.conversion", name: "Conversion Rate", domain: "Marketing", component: "KpiCard", permission: "analytics.view", service: "ga4DataService", route: null, refreshIntervalMs: 120_000, dataSource: "ga4", visibility: "whenAvailable", displayOrder: 5, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.bestSeller", name: "Best Seller", domain: "Business", component: "KpiCard", permission: "analytics.view", service: "businessOverviewService", route: "/admin/products", refreshIntervalMs: 300_000, dataSource: "orders", visibility: "always", displayOrder: 6, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.pending", name: "Awaiting Fulfilment", domain: "Operations", component: "KpiCard", permission: "analytics.view", service: "businessOverviewService", route: "/admin/orders?awaiting=1", refreshIntervalMs: 300_000, dataSource: "orders", visibility: "always", displayOrder: 7, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.criticalAlerts", name: "Critical Alerts", domain: "Operations", component: "KpiCard", permission: "analytics.view", service: "commandCenterService", route: "/admin/inventory", refreshIntervalMs: 300_000, dataSource: "derived", visibility: "always", displayOrder: 8, defaultSize: "sm", stage: 2 }),
  w({ key: "exec.lowStock", name: "Low Stock Count", domain: "Inventory", component: "KpiCard", permission: "analytics.view", service: "businessOverviewService", route: "/admin/inventory", refreshIntervalMs: 300_000, dataSource: "inventory", visibility: "always", displayOrder: 9, defaultSize: "sm", stage: 2 }),

  // ── Stage 4 · Trend charts (SamorahChart) ──
  w({ key: "chart.revenueTrend", name: "Revenue Trend", domain: "Finance", component: "SamorahChart", permission: "analytics.view", service: "analyticsService", route: "/admin/orders", refreshIntervalMs: null, dataSource: "orders", visibility: "always", displayOrder: 1, defaultSize: "lg", stage: 4 }),
  w({ key: "chart.ordersTrend", name: "Orders Trend", domain: "Business", component: "SamorahChart", permission: "analytics.view", service: "analyticsService", route: "/admin/orders", refreshIntervalMs: null, dataSource: "orders", visibility: "always", displayOrder: 2, defaultSize: "lg", stage: 4 }),
  w({ key: "chart.customersTrend", name: "Customers Trend", domain: "Customer", component: "SamorahChart", permission: "analytics.view", service: "customerAdminService", route: "/admin/customers", refreshIntervalMs: null, dataSource: "customers", visibility: "always", displayOrder: 3, defaultSize: "lg", stage: 4 }),
  w({ key: "chart.aovTrend", name: "Average Order Value Trend", domain: "Finance", component: "SamorahChart", permission: "analytics.view", service: "analyticsService", route: "/admin/orders", refreshIntervalMs: null, dataSource: "orders", visibility: "always", displayOrder: 4, defaultSize: "lg", stage: 4 }),

  // ── Stage 6 · Exports ──
  w({ key: "export.print", name: "Print Report", domain: "Business", component: "ExportButton", permission: "data.export", service: "analyticsService", route: null, refreshIntervalMs: null, dataSource: "derived", visibility: "always", displayOrder: 1, defaultSize: "sm", stage: 6 }),
  w({ key: "export.excel", name: "Export Excel", domain: "Business", component: "ExportButton", permission: "data.export", service: "analyticsService", route: null, refreshIntervalMs: null, dataSource: "derived", visibility: "always", displayOrder: 2, defaultSize: "sm", stage: 6 }),
  w({ key: "export.pdf", name: "Export PDF", domain: "Business", component: "ExportButton", permission: "data.export", service: "analyticsService", route: null, refreshIntervalMs: null, dataSource: "derived", visibility: "always", displayOrder: 3, defaultSize: "sm", stage: 6 }),

  // ── Stage 7 · Goals ──
  w({ key: "goals.summary", name: "Business Goals", domain: "Business", component: "GoalProgress", permission: "analytics.view", service: "businessOverviewService", route: null, refreshIntervalMs: null, dataSource: "orders", visibility: "whenAvailable", displayOrder: 1, defaultSize: "md", stage: 7 }),

  // ── System widgets (freshness + health) — foundation in Stage 1, surfaced in Stage 3 ──
  w({ key: "system.dataFreshness", name: "Data Freshness", domain: "System", component: "DataFreshnessBar", permission: "analytics.view", service: "clarityService", route: null, refreshIntervalMs: null, dataSource: "derived", visibility: "always", displayOrder: 1, defaultSize: "full", stage: 3 }),
  w({ key: "system.analyticsHealth", name: "Analytics Health", domain: "System", component: "AnalyticsHealth", permission: "analytics.view", service: "ga4DataService", route: null, refreshIntervalMs: null, dataSource: "derived", visibility: "always", displayOrder: 2, defaultSize: "full", stage: 3 }),
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
