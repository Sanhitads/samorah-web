// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createElement as h } from "react";
import { render, cleanup } from "@testing-library/react";
import { DataFreshnessBar } from "@/components/admin/DataFreshnessBar";

const now = Date.now();
const sources = [
  { label: "Orders", available: true, fetchedAtMs: now - 20_000, ttlMs: 60_000 },
  { label: "GA4", available: false, fetchedAtMs: null },
  { label: "Clarity", available: true, fetchedAtMs: null },
];

afterEach(() => { cleanup(); delete process.env.ANALYTICS_DISABLED_WIDGETS; });

describe("DataFreshnessBar (Stage 3)", () => {
  it("renders a chip per source with a status dot", () => {
    const { container } = render(h(DataFreshnessBar, { sources }));
    const chips = container.querySelectorAll(".an-fresh__chip");
    expect(chips.length).toBe(3);
    expect(container.textContent).toContain("Orders");
    expect(container.textContent).toContain("just now"); // fresh first-party
    expect(container.textContent).toContain("unavailable"); // GA4 off
    expect(container.textContent).toContain("live"); // Clarity available w/o timestamp
  });

  it("marks status via data-status (healthy vs unavailable)", () => {
    const { container } = render(h(DataFreshnessBar, { sources }));
    expect(container.querySelector('.an-fresh__chip[data-status="healthy"]')).toBeTruthy();
    expect(container.querySelector('.an-fresh__chip[data-status="unavailable"]')).toBeTruthy();
  });

  it("is hidden when the feature flag is disabled", () => {
    process.env.ANALYTICS_DISABLED_WIDGETS = "system.dataFreshness";
    const { container } = render(h(DataFreshnessBar, { sources }));
    expect(container.querySelector(".an-fresh")).toBeNull();
  });
});
