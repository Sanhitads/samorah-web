// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement as h } from "react";

const push = vi.fn(), replace = vi.fn(), refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh }) }));

import { render, cleanup, fireEvent } from "@testing-library/react";
import { ManufacturingManager } from "@/components/admin/ManufacturingManager";

const ROWS = [{
  id: "b1", batch_code: "KC-G190-261201-01", products: { name: "Kashmiri Chai" }, variants: { sku: "SAM-CAN-001-100G-GL" },
  manufacturing_date: "2026-12-01", planned_qty: 10, produced_qty: 10, pending_inspection_qty: 0, approved_qty: 8,
  rejected_qty: 1, qc_sampled_destroyed_qty: 1, lifecycle_status: "qc_approved", recall_state: "none", earliest_release_date: "2026-02-01",
}];
const VARIANTS = [{ id: "v1", sku: "SAM-CAN-001-100G-GL", vessel_type: "glass", size_label: "100g", is_active: true, product_id: "p1", products: { name: "Kashmiri Chai", product_type: "candle", batch_prefix: "KC" } }];
const base = { rows: ROWS, total: 1, page: 1, pageSize: 25, filters: { q: "", status: "", hold: false }, variants: VARIANTS };

beforeEach(() => { push.mockClear(); });
afterEach(() => cleanup());

describe("ManufacturingManager", () => {
  it("renders the batch row with code, product and status", () => {
    const { getByText, container } = render(h(ManufacturingManager, { ...base, caps: { operate: true, qc: true, approve: true } }));
    expect((getByText("KC-G190-261201-01") as HTMLAnchorElement).getAttribute("href")).toBe("/admin/manufacturing/b1");
    expect(container.textContent).toContain("Kashmiri Chai");
    expect(container.textContent).toContain("qc approved");
  });

  it("shows the create control only with manufacturing.operate", () => {
    const { queryByText, rerender } = render(h(ManufacturingManager, { ...base, caps: { operate: true, qc: true, approve: true } }));
    expect(queryByText("New batch")).not.toBeNull();
    rerender(h(ManufacturingManager, { ...base, caps: { operate: false, qc: false, approve: false } }));
    expect(queryByText("New batch")).toBeNull();
  });

  it("applies filters by navigating with query params", () => {
    const { getByPlaceholderText, getByText } = render(h(ManufacturingManager, { ...base, caps: { operate: true, qc: true, approve: true } }));
    fireEvent.change(getByPlaceholderText("Search product name or batch code…"), { target: { value: "KC" } });
    fireEvent.click(getByText("Filter"));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("q=KC"));
  });
});
