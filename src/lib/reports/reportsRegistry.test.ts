import { describe, it, expect, afterEach } from "vitest";
import { REPORTS_EXEC_KPIS, getReportsKpi, isReportsKpiEnabled, REPORTS_NON_DRILLABLE } from "@/lib/reports/reportsRegistry";
import { computeFinancials } from "@/lib/reports/financialEngine";
import * as reportsService from "@/services/reportsService";
import { resolveDrill, ANALYTICS_DRILL_TARGETS, DRILL_TARGET_STATUS, ANALYTICS_WIDGETS, type DrillTargetKey } from "@/lib/analytics/analyticsRegistry";

// Every drill destination referenced by ANY widget (Analytics widgets + Reports KPIs).
const referencedTargets = new Set<string>();
for (const w of ANALYTICS_WIDGETS) if (w.drillTarget) referencedTargets.add(w.drillTarget);
for (const w of REPORTS_EXEC_KPIS) if (w.drillTarget) referencedTargets.add(w.drillTarget);

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

  it("navigation consistency — every Reports drillTarget resolves through resolveDrill()", () => {
    for (const w of REPORTS_EXEC_KPIS) {
      if (!w.drillTarget) continue;
      expect(resolveDrill(w.drillTarget as DrillTargetKey), `${w.id} → ${w.drillTarget}`).not.toBeNull();
    }
  });

  it("navigation consistency — NO route drift between Reports and Analytics", () => {
    // Every Reports drillTarget is a key of the SHARED ANALYTICS_DRILL_TARGETS map, and Reports resolves to
    // the EXACT route Analytics defines — so Reports and Analytics can never drift apart.
    for (const w of REPORTS_EXEC_KPIS) {
      if (!w.drillTarget) continue;
      expect(Object.keys(ANALYTICS_DRILL_TARGETS), `${w.drillTarget} not a shared target`).toContain(w.drillTarget);
      const base = resolveDrill(w.drillTarget as DrillTargetKey)?.href;
      expect(base, `${w.drillTarget} drift`).toBe(ANALYTICS_DRILL_TARGETS[w.drillTarget as DrillTargetKey].route);
    }
  });

  it("navigation consistency — shared destinations (Revenue/Orders/Customers) match the Executive Summary exactly", () => {
    // Revenue, Operating Profit and Orders KPIs share the `orders` destination; Customers shares `customers`.
    expect(getReportsKpi("reports.revenue")?.drillTarget).toBe("orders");
    expect(getReportsKpi("reports.operatingProfit")?.drillTarget).toBe("orders");
    expect(getReportsKpi("reports.orders")?.drillTarget).toBe("orders");
    expect(getReportsKpi("reports.customers")?.drillTarget).toBe("customers");

    // The lower report tiles (P&L Revenue/Operating profit, Customers Buyers) use these same targets, so they
    // resolve IDENTICALLY to the Executive Summary KPIs — no divergent/duplicate routing, no broken links.
    const ordersHref = resolveDrill("orders", { range: "30d" })?.href;
    expect(ordersHref).toBe("/admin/orders?range=30d");
    expect(resolveDrill(getReportsKpi("reports.revenue")!.drillTarget!, { range: "30d" })?.href).toBe(ordersHref);
    expect(resolveDrill(getReportsKpi("reports.orders")!.drillTarget!, { range: "30d" })?.href).toBe(ordersHref);
    expect(resolveDrill("customers")?.href).toBe("/admin/customers");
    expect(resolveDrill(getReportsKpi("reports.customers")!.drillTarget!)?.href).toBe("/admin/customers");
  });

  it("registry completeness — every drill target is referenced by a widget OR documented reserved/deprecated (no dead routes)", () => {
    for (const key of Object.keys(ANALYTICS_DRILL_TARGETS)) {
      const referenced = referencedTargets.has(key);
      const status = DRILL_TARGET_STATUS[key as DrillTargetKey]?.status;
      expect(
        referenced || status === "reserved" || status === "deprecated",
        `${key}: dead route — unreferenced by any widget and not marked reserved/deprecated`,
      ).toBe(true);
    }
  });

  it("drill-target lifecycle metadata is complete and consistent with actual usage", () => {
    // Every target declares a status (the Record<DrillTargetKey> type also enforces this at compile time).
    for (const key of Object.keys(ANALYTICS_DRILL_TARGETS)) {
      expect(DRILL_TARGET_STATUS[key as DrillTargetKey], `${key} missing lifecycle status`).toBeTruthy();
    }
    for (const [key, meta] of Object.entries(DRILL_TARGET_STATUS)) {
      if (meta.status === "active") {
        expect(referencedTargets.has(key), `${key} marked active but referenced by no widget`).toBe(true);
      } else {
        // reserved / deprecated must justify themselves and must NOT be silently in use.
        expect((meta.reason ?? "").length, `${key} (${meta.status}) needs a reason`).toBeGreaterThan(0);
      }
    }
  });

  it("non-drillable metrics carry honest architectural metadata (no fake destinations, no id overlap)", () => {
    const drillableIds = new Set(REPORTS_EXEC_KPIS.map((w) => w.id));
    for (const m of REPORTS_NON_DRILLABLE) {
      expect(m.isDrillable).toBe(false);
      expect(m.reason.length, `${m.id} needs a reason`).toBeGreaterThan(0);
      expect(m.futureRequirement.length, `${m.id} needs a future requirement`).toBeGreaterThan(0);
      expect(drillableIds.has(m.id), `${m.id} cannot be both drillable and non-drillable`).toBe(false);
    }
    // The sections we intentionally left value-only are all documented.
    expect(REPORTS_NON_DRILLABLE.map((m) => m.id)).toEqual(
      expect.arrayContaining(["report.ordersByState", "report.topProducts", "report.gst", "report.fragrance", "report.coupons", "report.acquisition", "report.retention"]),
    );
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
