import { describe, it, expect, beforeEach } from "vitest";
import {
  PREVIEW_INITIAL,
  previewSetVessel,
  previewAddCandle,
  previewRemoveCandle,
  previewClear,
  type PreviewState,
} from "@/store/bundleController";
import { useCompositionStore, type CompositionItem } from "@/store/useCompositionStore";
import { useCartStore } from "@/store/useCartStore";

/**
 * PREVIEW ISOLATION (Amendment 10 / step 0I). The Admin preview drives the SAME shared renderer via the
 * ephemeral preview controller. This proves that exercising the preview state machine produces ZERO real
 * side effects: no persisted composition mutation, no cart write. The transitions are pure and import
 * nothing side-effecting, so cart/analytics/localStorage/drawer/reservation/navigation are unreachable —
 * asserted here at runtime against the real stores.
 */
const item = (id: string, vessel: string): CompositionItem => ({
  id, slug: id, name: id, vessel, size: "100g", price: 500, image: "gradient:x",
});

describe("preview controller — pure ephemeral selection", () => {
  it("adds up to three, no duplicates, respects the vessel", () => {
    let s: PreviewState = PREVIEW_INITIAL;
    s = previewSetVessel(s, "glass");
    s = previewAddCandle(s, item("a", "glass"));
    s = previewAddCandle(s, item("a", "glass")); // duplicate ignored
    s = previewAddCandle(s, item("b", "ceramic")); // wrong vessel ignored
    s = previewAddCandle(s, item("b", "glass"));
    s = previewAddCandle(s, item("c", "glass"));
    s = previewAddCandle(s, item("d", "glass")); // full (3) → ignored
    expect(s.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    s = previewRemoveCandle(s, "b");
    expect(s.items.map((i) => i.id)).toEqual(["a", "c"]);
  });
  it("switching vessel clears the set (no mixing)", () => {
    let s: PreviewState = previewSetVessel(PREVIEW_INITIAL, "glass");
    s = previewAddCandle(s, item("a", "glass"));
    s = previewSetVessel(s, "ceramic");
    expect(s).toEqual({ vessel: "ceramic", items: [] });
  });
  it("clear empties items but keeps the vessel", () => {
    let s: PreviewState = previewSetVessel(PREVIEW_INITIAL, "glass");
    s = previewAddCandle(s, item("a", "glass"));
    s = previewClear(s);
    expect(s).toEqual({ vessel: "glass", items: [] });
  });
});

describe("preview controller — ZERO real side effects", () => {
  beforeEach(() => {
    useCompositionStore.getState().clear();
    useCompositionStore.setState({ vessel: null, items: [], editingId: null });
    useCartStore.setState({ items: [] } as Partial<ReturnType<typeof useCartStore.getState>>);
  });

  it("driving a full preview composition never mutates the real composition or cart stores", () => {
    const compBefore = JSON.stringify(useCompositionStore.getState().items);
    const cartBefore = JSON.stringify(useCartStore.getState().items);

    // Build a COMPLETE 3-candle set entirely in the ephemeral preview state.
    let s: PreviewState = previewSetVessel(PREVIEW_INITIAL, "glass");
    for (const id of ["a", "b", "c"]) s = previewAddCandle(s, item(id, "glass"));
    expect(s.items).toHaveLength(3); // preview selection worked

    // The real persisted stores must be byte-identical (no persistence, no cart write, no commit).
    expect(JSON.stringify(useCompositionStore.getState().items)).toBe(compBefore);
    expect(useCompositionStore.getState().vessel).toBeNull();
    expect(JSON.stringify(useCartStore.getState().items)).toBe(cartBefore);
    expect(useCartStore.getState().items).toHaveLength(0); // nothing committed to cart
  });
});
