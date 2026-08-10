// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement as h } from "react";

// next/link → plain <a> so drill-down (normal/middle/ctrl-click) renders without a router.
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => h("a", { href, ...rest }, children) }));

import { render, cleanup } from "@testing-library/react";
import { KpiCard } from "@/components/admin/KpiCard";

afterEach(() => cleanup());

describe("KpiCard (shared analytics tile)", () => {
  it("renders value + label", () => {
    const { container } = render(h(KpiCard, { label: "Revenue Today", value: "₹42,300" }));
    expect(container.textContent).toContain("Revenue Today");
    expect(container.textContent).toContain("₹42,300");
  });

  it("shows a positive delta + up arrow when higher-is-better and rising", () => {
    const { container } = render(h(KpiCard, { label: "Revenue", value: "₹120", current: 120, previous: 100, periodLabel: "vs yesterday" }));
    const delta = container.querySelector(".cc-delta") as HTMLElement;
    expect(delta).toBeTruthy();
    expect(delta.getAttribute("data-tone")).toBe("up");
    expect(delta.textContent).toContain("20%");
    expect(delta.textContent).toContain("▲");
  });

  it("a rising lower-is-better metric is toned down/bad", () => {
    const { container } = render(h(KpiCard, { label: "Return rate", value: "12%", current: 12, previous: 10, higherIsBetter: false }));
    expect((container.querySelector(".cc-delta") as HTMLElement).getAttribute("data-tone")).toBe("down");
  });

  it("source-specific empty state replaces the value; no delta", () => {
    const { container } = render(h(KpiCard, { label: "Visitors Today", value: "—", empty: "GA4 not configured", current: 5, previous: 3 }));
    expect(container.textContent).toContain("GA4 not configured");
    expect(container.querySelector(".cc-delta")).toBeNull();
  });

  it("loading renders an aria-busy skeleton", () => {
    const { container } = render(h(KpiCard, { label: "Orders", value: "", loading: true }));
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelector(".kpi__skel")).toBeTruthy();
  });

  it("href makes it a drill-down link (works for modified clicks)", () => {
    const { container } = render(h(KpiCard, { label: "Pending", value: "3", href: "/admin/orders?status=pending" }));
    const a = container.querySelector("a") as HTMLAnchorElement;
    expect(a).toBeTruthy();
    expect(a.getAttribute("href")).toBe("/admin/orders?status=pending");
  });

  it("renders an inline sparkline when a series is given", () => {
    const { container } = render(h(KpiCard, { label: "Revenue", value: "₹1", sparkline: [1, 3, 2, 5, 4] }));
    expect(container.querySelector("svg.kpi__spark polyline")).toBeTruthy();
  });
});
