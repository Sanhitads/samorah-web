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
