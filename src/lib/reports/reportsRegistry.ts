/**
 * Reports registry (Stage R2) — the governance structure for the Reports Executive Summary, created here
 * WITH the widgets it governs (not before). Mirrors the analytics-registry philosophy (id / feature flag /
 * permission / drillTarget) and reuses the shared `resolveFlag` + `resolveDrill` seams — it does NOT touch
 * the analytics registry or its invariants.
 *
 * Two pieces of architectural metadata, NEVER displayed, exist purely for long-term maintainability and
 * audit — six months from now "where does this number come from?" is answered instantly:
 *   • `owner`  — the module responsible for maintaining the KPI (financialEngine | reportsService).
 *   • `source` — the exact canonical field the value is read from (e.g. "financialEngine.revenue").
 * Every financial value still originates from the canonical Financial Engine (R1A); no presentation surface
 * recomputes. RBAC reuses the EXISTING `analytics.view` capability (no new `reports.view` before launch).
 */
import type { Capability } from "@/lib/auth/capabilities";
import type { DrillTargetKey } from "@/lib/analytics/analyticsRegistry";
import { resolveFlag } from "@/lib/analytics/featureFlags";

/** The module responsible for a KPI. Must name a real module in the codebase. */
export type ReportsKpiOwner = "financialEngine" | "reportsService";

export interface ReportsKpiWidget {
  id: string;
  label: string;
  /** Module responsible for maintaining this KPI (architectural metadata — never displayed). */
  owner: ReportsKpiOwner;
  /** Canonical field this value is read from (architectural provenance — never displayed). */
  source: string;
  /** Display format for the value (KpiCard renders the string; this documents the shape). */
  format: "inr" | "percent" | "number";
  /** A rise is good? (revenue/profit/orders/customers up = good). Controls delta tone, not arrow. */
  higherIsBetter: boolean;
  /** Registry-resolved drill destination (via resolveDrill); omitted where no meaningful page exists. */
  drillTarget?: DrillTargetKey;
  permission: Capability;
  featureFlag: string;
  defaultEnabled: boolean;
}

const k = (o: Omit<ReportsKpiWidget, "featureFlag" | "defaultEnabled"> & { featureFlag?: string; defaultEnabled?: boolean }): ReportsKpiWidget => ({
  featureFlag: o.featureFlag ?? o.id,
  defaultEnabled: o.defaultEnabled ?? true,
  ...o,
});

/**
 * The five founder-scan financial KPIs — intentionally minimal (no GST in the strip). Order = revenue →
 * profit → margin → orders → customers. Each declares its canonical `owner`/`source`.
 */
export const REPORTS_EXEC_KPIS: ReportsKpiWidget[] = [
  k({ id: "reports.revenue",         label: "Revenue",          owner: "financialEngine", source: "financialEngine.revenue",         format: "inr",     higherIsBetter: true, drillTarget: "orders",    permission: "analytics.view" }),
  k({ id: "reports.operatingProfit", label: "Operating Profit", owner: "financialEngine", source: "financialEngine.operatingProfit", format: "inr",     higherIsBetter: true, drillTarget: "orders",    permission: "analytics.view" }),
  k({ id: "reports.margin",          label: "Margin",           owner: "financialEngine", source: "financialEngine.margin",          format: "percent", higherIsBetter: true, /* no drill — no meaningful destination */ permission: "analytics.view" }),
  k({ id: "reports.orders",          label: "Orders",           owner: "reportsService",  source: "reportsService.orders",           format: "number",  higherIsBetter: true, drillTarget: "orders",    permission: "analytics.view" }),
  k({ id: "reports.customers",       label: "Customers",        owner: "reportsService",  source: "reportsService.customers",        format: "number",  higherIsBetter: true, drillTarget: "customers", permission: "analytics.view" }),
];

/**
 * Intentionally NON-drillable report sections — ARCHITECTURAL METADATA ONLY (never rendered, no runtime
 * effect). Documents WHY each has no drill today and WHAT capability would unlock one, so a future developer
 * doesn't mistake the absence of a link for an oversight. No fake destinations are ever shipped.
 */
export interface NonDrillableMetric {
  id: string;
  label: string;
  isDrillable: false;
  reason: string;            // why there is no meaningful destination today
  futureRequirement: string; // the capability that would make it drillable later (roadmap only)
}

export const REPORTS_NON_DRILLABLE: NonDrillableMetric[] = [
  { id: "report.ordersByState", label: "Orders by state", isDrillable: false, reason: "No meaningful filtered destination exists — /admin/orders has no ship_state filter, so a drill would land on unfiltered orders.", futureRequirement: "Requires an Orders page state (ship_state) filter." },
  { id: "report.topProducts",   label: "Top products",    isDrillable: false, reason: "No per-product destination — report rows carry only a product name, not an id/slug to route to.",                                       futureRequirement: "Requires product-details routing (per-product page)." },
  { id: "report.gst",           label: "GST report",      isDrillable: false, reason: "No transaction-level GST destination exists to drill into.",                                                                                 futureRequirement: "Requires a GST transaction view." },
  { id: "report.fragrance",     label: "Fragrance performance", isDrillable: false, reason: "Fragrance family is not an addressable page.",                                                                                          futureRequirement: "Requires a fragrance analytics page." },
  { id: "report.coupons",       label: "Coupon usage",    isDrillable: false, reason: "No per-coupon detail destination exists.",                                                                                                   futureRequirement: "Requires a coupon detail page." },
  { id: "report.acquisition",   label: "Acquisition channels", isDrillable: false, reason: "No campaign-level destination exists.",                                                                                                  futureRequirement: "Requires campaign reporting." },
  { id: "report.retention",     label: "Retention cohorts", isDrillable: false, reason: "No cohort-drill destination exists.",                                                                                                      futureRequirement: "Requires a cohort explorer." },
];

const BY_ID: Record<string, ReportsKpiWidget> = Object.fromEntries(REPORTS_EXEC_KPIS.map((x) => [x.id, x]));

export function getReportsKpi(id: string): ReportsKpiWidget | undefined {
  return BY_ID[id];
}

/** Is this KPI enabled? Unknown id → false. Reuses the shared feature-flag seam (env-overridable). */
export function isReportsKpiEnabled(id: string): boolean {
  const w = BY_ID[id];
  if (!w) return false;
  return resolveFlag(w.featureFlag, w.defaultEnabled);
}
