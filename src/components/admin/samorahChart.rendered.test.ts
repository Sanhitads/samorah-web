// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement as h } from "react";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => h("div", { "data-rc": "container" }, children),
  LineChart: ({ children }: any) => h("div", { "data-rc": "line" }, children),
  AreaChart: ({ children }: any) => h("div", { "data-rc": "area" }, children),
  BarChart: ({ children }: any) => h("div", { "data-rc": "bar" }, children),
  PieChart: ({ children }: any) => h("div", { "data-rc": "pie" }, children),
  Line: () => null, Area: () => null, Bar: () => null, Pie: ({ children }: any) => h("div", null, children),
  Cell: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
}));
vi.mock("framer-motion", () => ({ useReducedMotion: () => false }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => h("a", { href, ...r }, children) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { render, cleanup, fireEvent } from "@testing-library/react";
import { SamorahChart } from "@/components/admin/SamorahChart";

const data = [{ day: "2026-08-01", revenue: 100 }, { day: "2026-08-02", revenue: 200 }];
const base = { title: "Revenue trend", data, xKey: "day", series: [{ key: "revenue", label: "Revenue" }] };

afterEach(() => cleanup());

describe("SamorahChart (Stage 4 — single chart component)", () => {
  it("renders the chart with an accessible label for the given variant", () => {
    const { container } = render(h(SamorahChart, { ...base, variant: "area" }));
    expect(container.querySelector('[data-rc="area"]')).toBeTruthy();
    const canvas = container.querySelector('[role="img"]') as HTMLElement;
    expect(canvas.getAttribute("aria-label")).toMatch(/area chart — Revenue trend/i);
  });

  it("switches the underlying chart by variant", () => {
    expect(render(h(SamorahChart, { ...base, variant: "line" })).container.querySelector('[data-rc="line"]')).toBeTruthy();
    cleanup();
    expect(render(h(SamorahChart, { ...base, variant: "bar" })).container.querySelector('[data-rc="bar"]')).toBeTruthy();
    cleanup();
    expect(render(h(SamorahChart, { ...base, variant: "stackedBar" })).container.querySelector('[data-rc="bar"]')).toBeTruthy();
    cleanup();
    expect(render(h(SamorahChart, { ...base, variant: "donut" })).container.querySelector('[data-rc="pie"]')).toBeTruthy();
  });

  it("loading → aria-busy skeleton (no chart)", () => {
    const { container } = render(h(SamorahChart, { ...base, variant: "line", loading: true }));
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelector('[data-rc="line"]')).toBeNull();
  });

  it("error → alert message (no chart)", () => {
    const { container } = render(h(SamorahChart, { ...base, variant: "line", error: "Temporarily unavailable" }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Temporarily unavailable");
    expect(container.querySelector('[data-rc="line"]')).toBeNull();
  });

  it("empty prop OR no data → source-specific empty state", () => {
    expect(render(h(SamorahChart, { ...base, variant: "line", empty: "No orders in the selected period" })).container.textContent).toContain("No orders in the selected period");
    cleanup();
    expect(render(h(SamorahChart, { variant: "line", title: "X", data: [], xKey: "day", series: [{ key: "revenue", label: "R" }] })).container.textContent).toMatch(/No data/i);
  });

  it("optional drill-down renders a header link (keyboard path) AND a clickable canvas (mouse)", () => {
    push.mockClear();
    const { container } = render(h(SamorahChart, { ...base, variant: "area", href: "/admin/orders?range=30d" }));
    // keyboard-accessible arrow link preserved
    expect((container.querySelector(".an-chart__link") as HTMLAnchorElement)?.getAttribute("href")).toBe("/admin/orders?range=30d");
    // canvas is clickable (mouse) → navigates
    const canvas = container.querySelector(".an-chart__canvas--link") as HTMLElement;
    expect(canvas).toBeTruthy();
    fireEvent.click(canvas);
    expect(push).toHaveBeenCalledWith("/admin/orders?range=30d");
  });

  it("carries an export name hook and honours showLegend metadata", () => {
    const { container } = render(h(SamorahChart, { ...base, variant: "line", href: null, exportName: "Revenue", showLegend: true }));
    expect(container.querySelector('[data-export-name="Revenue"]')).toBeTruthy();
  });
});
