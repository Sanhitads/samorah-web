// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement as h } from "react";

// Mock the chart to a title marker so we test SalesTrends composition + feature flags (not Recharts).
vi.mock("@/components/admin/SamorahChart", () => ({
  SamorahChart: ({ title, empty }: any) => h("div", { "data-chart": title }, empty ?? "chart"),
}));

import { render, cleanup } from "@testing-library/react";
import { SalesTrends } from "@/components/admin/SalesTrends";
import type { AnalyticsSeriesPoint } from "@/services/businessOverviewService";

const series: AnalyticsSeriesPoint[] = [
  { day: "2026-08-01", orders: 3, revenue: 4500, customers: 3, aov: 1500 },
  { day: "2026-08-02", orders: 5, revenue: 7500, customers: 4, aov: 1500 },
];

afterEach(() => { cleanup(); delete process.env.ANALYTICS_DISABLED_WIDGETS; });

describe("SalesTrends (Stage 4)", () => {
  it("renders the four trend charts below Revenue", () => {
    const { container } = render(h(SalesTrends, { series, windowLabel: "30 days", ordersRange: "30d" }));
    const titles = [...container.querySelectorAll("[data-chart]")].map((el) => el.getAttribute("data-chart"));
    expect(titles).toEqual(["Revenue trend", "Orders trend", "Average order value trend", "Customers trend"]);
    expect(container.querySelector("#trends")).toBeTruthy();
  });

  it("each chart is independently feature-flagged", () => {
    process.env.ANALYTICS_DISABLED_WIDGETS = "chart.customersTrend";
    const { container } = render(h(SalesTrends, { series, windowLabel: "30 days", ordersRange: "30d" }));
    const titles = [...container.querySelectorAll("[data-chart]")].map((el) => el.getAttribute("data-chart"));
    expect(titles).not.toContain("Customers trend");
    expect(titles.length).toBe(3);
  });

  it("empty series passes a source-specific empty message to the charts", () => {
    const { container } = render(h(SalesTrends, { series: [], windowLabel: "30 days", ordersRange: null }));
    expect(container.textContent).toContain("No orders in the selected period");
  });
});
