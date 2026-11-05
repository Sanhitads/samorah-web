// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createElement as h } from "react";
import { render, cleanup } from "@testing-library/react";
import { BatchProvenancePanel, type Entitlements } from "@/components/admin/BatchProvenancePanel";

const baseItem = { order_item_id: "oi1", variant_id: "v1", is_bundle: false, ordered: 3, allocated: 3, picked_qty: 0, picked_confirmed: 1, shipped: 0, refunded_identifiable: 0, remaining_fulfillable: 3 };

afterEach(() => cleanup());

describe("BatchProvenancePanel", () => {
  it("shows the actual confirm UI and per-line quantities when not blocked", () => {
    const ent: Entitlements = { order_id: "o1", order_blocked: false, block_reason: null, items: [baseItem] };
    const { container, queryByText } = render(h(BatchProvenancePanel, {
      orderId: "o1", orderNumber: "SAM-1", entitlements: ent,
      picks: [{ order_item_id: "oi1", batch_id: "abcd1234-xyz", qty: 1, is_substitution: true, allocated_batch_id: "other", reason: "shelf empty" }],
      shipped: [{ order_item_id: "oi1", batch_id: "abcd1234-xyz", qty: 1 }],
    }));
    expect(container.textContent).toContain("ordered 3");
    expect(container.textContent).toContain("remaining 3");
    expect(container.textContent).toContain("(subst.)");           // substitution chip
    expect(container.textContent).toContain("Shipped batch summary");
    expect(queryByText("Confirm")).not.toBeNull();                 // confirm control present
  });

  it("surfaces the blocking reason and hides the confirm control when the order is blocked", () => {
    const ent: Entitlements = { order_id: "o1", order_blocked: true, block_reason: "fully_refunded", items: [baseItem] };
    const { container, queryByText } = render(h(BatchProvenancePanel, {
      orderId: "o1", orderNumber: "SAM-1", entitlements: ent, picks: [], shipped: [],
    }));
    expect(container.textContent).toContain("fully refunded");
    expect(queryByText("Confirm")).toBeNull();
  });
});
