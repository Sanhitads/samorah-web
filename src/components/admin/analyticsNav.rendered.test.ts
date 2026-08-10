// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement as h } from "react";

const push = vi.fn(), replace = vi.fn(), refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh }) }));

import { render, cleanup, fireEvent } from "@testing-library/react";
import { AnalyticsNav } from "@/components/admin/AnalyticsNav";

const WINDOWS = [{ k: "7", l: "7 days" }, { k: "30", l: "30 days" }, { k: "90", l: "90 days" }, { k: "all", l: "All time" }];
const SECTIONS = [{ id: "revenue", label: "Revenue" }, { id: "returns", label: "Returns" }];

beforeEach(() => {
  push.mockClear(); replace.mockClear(); refresh.mockClear();
  window.localStorage.clear();
  (Element.prototype as any).scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

describe("AnalyticsNav (Stage 3)", () => {
  it("renders the date selector with the current window active", () => {
    const { container } = render(h(AnalyticsNav, { window: "30", windows: WINDOWS, sections: SECTIONS }));
    const active = container.querySelector('.an-date[data-active="1"]') as HTMLElement;
    expect(active.textContent).toBe("30 days");
    expect(container.querySelectorAll(".an-date").length).toBe(4);
  });

  it("picking a window navigates and persists it (remember last range)", () => {
    const { getByText } = render(h(AnalyticsNav, { window: "30", windows: WINDOWS, sections: SECTIONS }));
    fireEvent.click(getByText("90 days"));
    expect(push).toHaveBeenCalledWith("/admin/analytics?window=90");
    expect(window.localStorage.getItem("samorah.analytics.filters.v1")).toContain('"window":"90"');
  });

  it("renders section jump links and smooth-scrolls on click", () => {
    document.body.innerHTML = '<div id="revenue"></div>';
    const { getByText, container } = render(h(AnalyticsNav, { window: "30", windows: WINDOWS, sections: SECTIONS }));
    expect(container.querySelectorAll(".an-jump").length).toBe(2);
    const link = getByText("Revenue");
    expect(link.getAttribute("href")).toBe("#revenue");
    fireEvent.click(link);
    expect((document.getElementById("revenue") as any).scrollIntoView).toHaveBeenCalled();
  });

  it("manual refresh triggers router.refresh", () => {
    const { getByRole } = render(h(AnalyticsNav, { window: "30", windows: WINDOWS, sections: SECTIONS }));
    fireEvent.click(getByRole("button", { name: /refresh analytics now/i }));
    expect(refresh).toHaveBeenCalled();
  });

  it("has an auto-refresh toggle and a last-updated stamp", () => {
    const { container } = render(h(AnalyticsNav, { window: "30", windows: WINDOWS, sections: SECTIONS }));
    expect(container.querySelector('.an-auto input[type="checkbox"]')).toBeTruthy();
    expect(container.querySelector(".an-updated")?.textContent).toMatch(/Updated/);
  });
});
