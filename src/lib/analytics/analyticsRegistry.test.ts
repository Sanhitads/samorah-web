import { describe, it, expect, afterEach } from "vitest";
import { ANALYTICS_WIDGETS, getWidget, widgetsForStage, widgetsForDomain, isWidgetEnabled, ANALYTICS_SECTIONS, getSection, searchSections } from "@/lib/analytics/analyticsRegistry";

const DOMAINS = ["Business", "Operations", "Marketing", "Finance", "Customer", "Inventory", "System"];

afterEach(() => {
  delete process.env.ANALYTICS_DISABLED_WIDGETS;
  delete process.env.ANALYTICS_ENABLED_WIDGETS;
});

describe("analyticsRegistry (single source of truth)", () => {
  it("every widget declares the required metadata", () => {
    for (const wd of ANALYTICS_WIDGETS) {
      expect(wd.key).toBeTruthy();
      expect(wd.name).toBeTruthy();
      expect(wd.component).toBeTruthy();
      expect(wd.featureFlag).toBeTruthy();
      expect(typeof wd.defaultEnabled).toBe("boolean");
      expect(wd.permission).toMatch(/^(analytics\.view|data\.export)$/);
      expect(DOMAINS).toContain(wd.domain);
      expect(wd.service).toBeTruthy();
      expect(["always", "whenAvailable"]).toContain(wd.visibility);
      expect(["sm", "md", "lg", "full"]).toContain(wd.defaultSize);
      expect([1, 2, 3, 4, 5, 6, 7]).toContain(wd.stage);
    }
  });

  it("keys and feature flags are unique", () => {
    const keys = ANALYTICS_WIDGETS.map((w) => w.key);
    const flags = ANALYTICS_WIDGETS.map((w) => w.featureFlag);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(flags).size).toBe(flags.length);
  });

  it("getWidget resolves known / unknown", () => {
    expect(getWidget("exec.revenue")?.name).toBe("Revenue Today");
    expect(getWidget("nope.nope")).toBeUndefined();
  });

  it("widgetsForStage(2) returns the executive cards in display order", () => {
    const s2 = widgetsForStage(2);
    expect(s2.length).toBeGreaterThanOrEqual(9);
    expect(s2[0].key).toBe("exec.revenue");
    expect(s2.map((w) => w.displayOrder)).toEqual([...s2.map((w) => w.displayOrder)].sort((a, b) => a - b));
  });

  it("widgetsForDomain groups by owner domain", () => {
    expect(widgetsForDomain("System").map((w) => w.key)).toEqual(["system.dataFreshness", "system.analyticsHealth"]);
    expect(widgetsForDomain("Finance").length).toBeGreaterThan(0);
  });

  it("ANALYTICS_SECTIONS: stable unique ids, labels + searchable keywords", () => {
    const ids = ANALYTICS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("executive-summary");
    for (const s of ANALYTICS_SECTIONS) {
      expect(s.label).toBeTruthy();
      expect(s.keywords.length).toBeGreaterThan(0);
    }
    expect(getSection("revenue")?.label).toBe("Revenue");
    expect(getSection("nope")).toBeUndefined();
  });

  it("searchSections resolves a query to sections (future search seam)", () => {
    expect(searchSections("rage click").map((s) => s.id)).toContain("clarity");
    expect(searchSections("utm").map((s) => s.id)).toEqual(expect.arrayContaining(["attribution", "campaigns"]));
    expect(searchSections("")).toEqual([]);
  });

  it("isWidgetEnabled defaults on, respects env disable/enable overrides, false for unknown", () => {
    expect(isWidgetEnabled("exec.revenue")).toBe(true);
    expect(isWidgetEnabled("does.not.exist")).toBe(false);
    process.env.ANALYTICS_DISABLED_WIDGETS = "exec.revenue, exec.orders";
    expect(isWidgetEnabled("exec.revenue")).toBe(false);
    expect(isWidgetEnabled("exec.aov")).toBe(true);
  });
});
