import { describe, it, expect, afterEach } from "vitest";
import { REPORTS_EXEC_KPIS, getReportsKpi, isReportsKpiEnabled } from "@/lib/reports/reportsRegistry";
import { computeFinancials } from "@/lib/reports/financialEngine";
import * as reportsService from "@/services/reportsService";
import { resolveDrill, type DrillTargetKey } from "@/lib/analytics/analyticsRegistry";

/**
 * Stage R2 provenance verification: every Executive Summary KPI resolves from its documented canonical
 * source, every owner references a real module, and no fake drill destinations exist.
 */

// The canonical Executive Summary fields (the shape getExecutiveSummary returns).
const EXEC_FIELDS = ["revenue", "operatingProfit", "margin", "orders", "customers"];

// A sample engine output — the set of fields owner "financialEngine" can legitimately expose.
const engineFields = new Set(
  Object.keys(
    computeFinancials({
      orders: 1, grossSales: 0, discounts: 0, shippingCollected: 0, gstCollected: 0, grossCollected: 0,
      netRevenue: 0, refunds: 0, cogs: 0, packaging: 0, shippingCost: 0, gatewayFees: 0, variantsMissingCost: 0,
    }),
  ),
);

// owner name → a real exported symbol proving the module exists and is importable.
const OWNER_MODULES: Record<string, unknown> = {
  financialEngine: computeFinancials,
  reportsService: reportsService.getExecutiveSummary,
};

afterEach(() => {
  delete process.env.ANALYTICS_DISABLED_WIDGETS;
  delete process.env.ANALYTICS_ENABLED_WIDGETS;
});

describe("reportsRegistry — Executive Summary provenance (R2)", () => {
  it("exposes exactly the 5 intentional KPIs (no GST in the strip)", () => {
    expect(REPORTS_EXEC_KPIS.map((w) => w.id)).toEqual([
      "reports.revenue", "reports.operatingProfit", "reports.margin", "reports.orders", "reports.customers",
    ]);
    expect(REPORTS_EXEC_KPIS.some((w) => /gst/i.test(w.id) || /gst/i.test(w.label))).toBe(false);
  });

  it("every KPI's source resolves to a real canonical field", () => {
    for (const w of REPORTS_EXEC_KPIS) {
      const [, field] = w.source.split(".");
      expect(field, `${w.id} source missing a field`).toBeTruthy();
      // Provenance: the source field is one of the canonical Executive Summary fields …
      expect(EXEC_FIELDS, `${w.id} → ${w.source}`).toContain(field);
      // … and for financialEngine-owned KPIs it is a real field the engine actually produces.
      if (w.owner === "financialEngine") expect(engineFields.has(field), `${w.source} not on engine output`).toBe(true);
    }
  });

  it("every KPI owner references a real, importable module", () => {
    for (const w of REPORTS_EXEC_KPIS) {
      expect(Object.keys(OWNER_MODULES), `${w.id} owner ${w.owner}`).toContain(w.owner);
      expect(OWNER_MODULES[w.owner], `${w.owner} module not importable`).toBeTypeOf("function");
    }
  });

  it("preserves existing RBAC — analytics.view only, no reports.view", () => {
    for (const w of REPORTS_EXEC_KPIS) expect(w.permission).toBe("analytics.view");
  });

  it("every declared drillTarget resolves to a real destination (no fake drills)", () => {
    for (const w of REPORTS_EXEC_KPIS) {
      if (!w.drillTarget) continue;
      expect(resolveDrill(w.drillTarget as DrillTargetKey), `${w.id} → ${w.drillTarget}`).not.toBeNull();
    }
    // Margin intentionally has no drill (no meaningful destination).
    expect(getReportsKpi("reports.margin")?.drillTarget).toBeUndefined();
  });

  it("feature flags are unique and default on, and respect env overrides", () => {
    const flags = REPORTS_EXEC_KPIS.map((w) => w.featureFlag);
    expect(new Set(flags).size).toBe(flags.length);
    expect(isReportsKpiEnabled("reports.revenue")).toBe(true);
    expect(isReportsKpiEnabled("nope")).toBe(false);
    process.env.ANALYTICS_DISABLED_WIDGETS = "reports.revenue";
    expect(isReportsKpiEnabled("reports.revenue")).toBe(false);
    expect(isReportsKpiEnabled("reports.orders")).toBe(true);
  });
});
