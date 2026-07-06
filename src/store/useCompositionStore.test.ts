import { describe, it, expect, beforeEach } from "vitest";
import { useCompositionStore, type CompositionItem } from "@/store/useCompositionStore";

const item = (id: string, vessel: string): CompositionItem => ({
  id,
  slug: id,
  name: id,
  image: `gradient:grad-${id}`,
  vessel,
  size: "100g",
  price: 580,
});

const reset = () => useCompositionStore.setState({ vessel: null, items: [], editingId: null });
const S = () => useCompositionStore.getState();

describe("Discovery Composition store — single-vessel rules", () => {
  beforeEach(reset);

  it("COMP-001 / BND-001 — 3 same-vessel candles complete the composition", () => {
    S().addCandle(item("a", "glass"));
    S().addCandle(item("b", "glass"));
    S().addCandle(item("c", "glass"));
    expect(S().items).toHaveLength(3);
    expect(S().vessel).toBe("glass");
  });

  it("COMP-002 / BND-002 — 2 candles is not complete", () => {
    S().addCandle(item("a", "glass"));
    S().addCandle(item("b", "glass"));
    expect(S().items).toHaveLength(2); // engine grants no discount until 3
  });

  it("COMP-003 — a 4th candle is blocked (max 3)", () => {
    ["a", "b", "c", "d"].forEach((id) => S().addCandle(item(id, "glass")));
    expect(S().items).toHaveLength(3);
    expect(S().items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("COMP-004 / BND-004 — mixing vessels is rejected", () => {
    S().addCandle(item("a", "glass"));
    S().addCandle(item("b", "ceramic")); // different vessel → ignored
    expect(S().items).toHaveLength(1);
    expect(S().vessel).toBe("glass");
  });

  it("no duplicate fragrance in one composition", () => {
    S().addCandle(item("a", "glass"));
    S().addCandle(item("a", "glass"));
    expect(S().items).toHaveLength(1);
  });

  it("COMP-005 — removing a candle makes the set incomplete", () => {
    ["a", "b", "c"].forEach((id) => S().addCandle(item(id, "glass")));
    S().removeCandle("b");
    expect(S().items).toHaveLength(2);
  });

  it("switching vessel clears the in-progress composition (no mixing)", () => {
    S().addCandle(item("a", "glass"));
    S().setVessel("ceramic");
    expect(S().items).toHaveLength(0);
    expect(S().vessel).toBe("ceramic");
  });

  it("COMP-006/008 — loadComposition replaces the set + marks editingId", () => {
    S().addCandle(item("x", "glass"));
    S().loadComposition("ceramic", [item("a", "ceramic"), item("b", "ceramic"), item("c", "ceramic")], "comp-123");
    expect(S().vessel).toBe("ceramic");
    expect(S().items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(S().editingId).toBe("comp-123");
  });
});
