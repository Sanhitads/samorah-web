// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement as h } from "react";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => h("a", { href, ...rest }, children) }));

import { render, cleanup } from "@testing-library/react";
import { ExecutiveSummary } from "@/components/admin/ExecutiveSummary";
import type { KpiSnapshot, BusinessOverview } from "@/services/businessOverviewService";
import type { Ga4Insights } from "@/services/ga4DataService";

const kpi: KpiSnapshot = {
  windowDays: 30,
  revenue: { current: 1_499_950, previous: 1_495_450 },
  orders: { current: 2014, previous: 2010 },
  avgBasket: { current: 744, previous: 743 },
  revenueToday: { current: 42_300, previous: 35_000 },
  ordersToday: { current: 12, previous: 10 },
  freshness: { source: "orders", fetchedAtMs: Date.now(), ttlMs: 60_000, available: true, status: "healthy" },
};
const overview = {
  today: { orders: 12, revenue: 42_300 },
  window: { days: 30, orders: 2014, revenue: 1_499_950, avgBasket: 744, pending: 3, cancelled: 0, refunded: 1 },
  payment: { codShare: 40, prepaidShare: 60, codOrders: 5, prepaidOrders: 7 },
  customers: { total: 100, returningRate: 20, repeatRate: 20 },
  inventory: { outOfStock: 2, lowStock: 5 },
  bestSellers: [{ name: "Wild Majesty", units: 40, revenue: 12_000 }],
  worstSellers: [],
} as BusinessOverview;
const ga4Off: Ga4Insights = { available: false, activeUsers: null, sessions7d: null, conversions7d: null, conversionRate: null, error: "not_configured" } as Ga4Insights;
const ga4On: Ga4Insights = { available: true, activeUsers: 37, sessions7d: 900, conversions7d: 45, conversionRate: 5 } as Ga4Insights;

const spark = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

afterEach(() => { cleanup(); delete process.env.ANALYTICS_DISABLED_WIDGETS; });

describe("ExecutiveSummary (Stage 2)", () => {
  it("renders the core KPI cards with values + revenue delta", () => {
    const { container } = render(h(ExecutiveSummary, { kpi, overview, ga4: ga4Off, revenueSpark: spark, windowLabel: "30 days", ordersRange: "30d" }));
    expect(container.textContent).toContain("Revenue Today");
    expect(container.textContent).toContain("₹42,300");
    expect(container.textContent).toContain("Orders Today");
    expect(container.textContent).toContain("Wild Majesty"); // best seller
    // revenue rose 42300 vs 35000 → up delta
    expect(container.querySelector('.cc-delta[data-tone="up"]')).toBeTruthy();
    // revenue sparkline present
    expect(container.querySelector("svg.kpi__spark")).toBeTruthy();
  });

  it("GA4 cards degrade to a source-specific empty state when unavailable", () => {
    const { container } = render(h(ExecutiveSummary, { kpi, overview, ga4: ga4Off, revenueSpark: spark, windowLabel: "30 days", ordersRange: "30d" }));
    expect(container.textContent).toContain("GA4 not configured");
  });

  it("GA4 cards show values when available", () => {
    const { container } = render(h(ExecutiveSummary, { kpi, overview, ga4: ga4On, revenueSpark: spark, windowLabel: "30 days", ordersRange: "30d" }));
    expect(container.textContent).toContain("37"); // active users
    expect(container.textContent).toContain("5%"); // conversion
    expect(container.textContent).not.toContain("GA4 not configured");
  });

  it("pending + low-stock + critical render warn tone when non-zero", () => {
    const { container } = render(h(ExecutiveSummary, { kpi, overview, ga4: ga4Off, revenueSpark: spark, windowLabel: "30 days", ordersRange: "30d" }));
    expect(container.querySelectorAll('.ash-metric__v[data-tone="warn"]').length).toBeGreaterThanOrEqual(2);
  });

  it("drill-down links point at existing admin pages", () => {
    const { container } = render(h(ExecutiveSummary, { kpi, overview, ga4: ga4Off, revenueSpark: spark, windowLabel: "30 days", ordersRange: "30d" }));
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/admin/orders?range=today"); // Revenue/Orders Today
    expect(hrefs).toContain("/admin/orders?range=30d"); // AOV for the window
    expect(hrefs).toContain("/admin/orders?awaiting=1"); // Awaiting Fulfilment
    expect(hrefs).toContain("/admin/inventory"); // Low Stock / Critical Alerts
  });

  it("renames Pending → Awaiting Fulfilment and shows a section Last-updated stamp", () => {
    const { container } = render(h(ExecutiveSummary, { kpi, overview, ga4: ga4Off, revenueSpark: spark, windowLabel: "30 days", ordersRange: "30d" }));
    expect(container.textContent).toContain("Awaiting Fulfilment");
    expect(container.textContent).not.toContain("Pending Orders");
    expect(container.querySelector(".ash-updated")?.textContent).toMatch(/Last updated/i);
  });

  it("a disabled feature flag removes only that card", () => {
    process.env.ANALYTICS_DISABLED_WIDGETS = "exec.revenue";
    const { container } = render(h(ExecutiveSummary, { kpi, overview, ga4: ga4Off, revenueSpark: spark, windowLabel: "30 days", ordersRange: "30d" }));
    expect(container.textContent).not.toContain("Revenue Today");
    expect(container.textContent).toContain("Orders Today"); // others remain
  });
});
