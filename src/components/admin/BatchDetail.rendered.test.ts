// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement as h } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

import { render, cleanup } from "@testing-library/react";
import { BatchDetail } from "@/components/admin/BatchDetail";

const baseBatch = {
  id: "b1", batch_code: "KC-G190-261201-01", sku_snapshot: "SAM-CAN-001-100G-GL", product_type: "candle",
  lifecycle_status: "quality_check", recall_state: "none", planned_qty: 10, produced_qty: 10,
  pending_inspection_qty: 3, approved_qty: 0, rejected_qty: 0, qc_sampled_destroyed_qty: 0, qc_revision: 0,
  manufacturing_date: "2026-12-01", cure_start_date: "2026-11-01", earliest_release_date: "2027-06-01",
  production_started_at: null, production_completed_at: null, batch_candle_spec: null,
};
const common = {
  timeline: [{ id: "t1", dimension: "lifecycle", from_state: null, to_state: "draft", reason: null, created_at: "2026-12-01T10:00:00Z" }],
  qc: [], validations: [], designValidation: { validated: false, fingerprint: "abc" },
  consumed: [], templates: [], materials: [], lots: [],
};

afterEach(() => cleanup());

describe("BatchDetail", () => {
  it("lists why QC approval is blocked", () => {
    const { container } = render(h(BatchDetail, { batch: baseBatch, ...common, caps: { operate: true, qc: true, approve: true } }));
    expect(container.textContent).toContain("QC approval unavailable");
    expect(container.textContent).toContain("3 units still pending inspection");
    expect(container.textContent).toContain("no approved quantity");
    expect(container.textContent).toContain("no passing routine QC");
    expect(container.textContent).toContain("cure not complete");
  });

  it("gates the Approve action on the qc_approve capability", () => {
    const eligible = { ...baseBatch, pending_inspection_qty: 0, approved_qty: 8, earliest_release_date: "2026-01-01" };
    const qc = [{ id: "q1", check_type: "routine", result: "pass", performed_at: "2026-12-02T10:00:00Z", inspected_qty: 10, approved_delta: 8, rejected_delta: 1, sampled_destroyed_delta: 1, measurements: {} }];
    const withApprove = render(h(BatchDetail, { batch: eligible, ...common, qc, caps: { operate: true, qc: true, approve: true } }));
    expect(withApprove.queryByText("Approve QC")).not.toBeNull();
    cleanup();
    const without = render(h(BatchDetail, { batch: eligible, ...common, qc, caps: { operate: true, qc: true, approve: false } }));
    expect(without.queryByText("Approve QC")).toBeNull();
  });

  it("shows the production record read-only outside draft/in_production", () => {
    const { container } = render(h(BatchDetail, { batch: baseBatch, ...common, caps: { operate: true, qc: true, approve: true } }));
    expect(container.textContent).toContain("read-only in the Quality check state");
  });
});
