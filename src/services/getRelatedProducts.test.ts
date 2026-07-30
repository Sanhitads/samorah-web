import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * getRelatedProducts — the storefront "You may also like" resolver. Batch A wired in curated
 * `related_products` overrides ON TOP of the existing same-fragrance / same-collection algorithm.
 * These tests pin the additive contract: with NO overrides the result is byte-for-byte the old
 * behaviour; with overrides they lead, in order, and the algorithm only fills the remaining slots.
 */

// Fixtures the mocked Supabase client reads (swapped per test).
let fx: { rel: { related_product_id: string; sort_order: number }[]; cards: { id: string }[]; algo: { id: string }[] } = { rel: [], cards: [], algo: [] };

function makeBuilder(table: string) {
  const state = { in: false, neq: false };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    neq: () => { state.neq = true; return builder; },
    in: () => { state.in = true; return builder; },
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: unknown) => void) => {
      if (table === "related_products") return resolve({ data: fx.rel, error: null });
      if (table === "products" && state.in) return resolve({ data: fx.cards, error: null });
      if (table === "products" && state.neq) return resolve({ data: fx.algo, error: null });
      return resolve({ data: [], error: null });
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ from: (t: string) => makeBuilder(t) }),
}));
vi.mock("@/services/collectionService", () => ({ getEditionMap: async () => new Map() }));

import { getRelatedProducts } from "@/services/productService";

const P = { id: "self", fragrance_family: "amber", collection_id: "c1" };

describe("getRelatedProducts — curated overrides layered over the algorithm", () => {
  beforeEach(() => { fx = { rel: [], cards: [], algo: [] }; });

  it("no overrides ⇒ identical to the algorithm result (non-breaking)", async () => {
    fx.algo = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const out = await getRelatedProducts(P, 4);
    expect(out.map((x) => (x as { id: string }).id)).toEqual(["a", "b", "c", "d"]);
  });

  it("overrides lead in their saved order, algorithm fills the rest", async () => {
    fx.rel = [{ related_product_id: "x", sort_order: 0 }, { related_product_id: "y", sort_order: 1 }];
    fx.cards = [{ id: "y" }, { id: "x" }]; // returned unordered — function must re-order to sort_order
    fx.algo = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const out = await getRelatedProducts(P, 4);
    expect(out.map((x) => (x as { id: string }).id)).toEqual(["x", "y", "a", "b"]);
  });

  it("de-dupes: an algorithm hit that is also a curated pick is dropped", async () => {
    fx.rel = [{ related_product_id: "a", sort_order: 0 }];
    fx.cards = [{ id: "a" }];
    fx.algo = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const out = await getRelatedProducts(P, 3);
    expect(out.map((x) => (x as { id: string }).id)).toEqual(["a", "b", "c"]);
  });

  it("enough overrides ⇒ algorithm not needed, result capped to limit", async () => {
    fx.rel = [{ related_product_id: "x", sort_order: 0 }, { related_product_id: "y", sort_order: 1 }, { related_product_id: "z", sort_order: 2 }];
    fx.cards = [{ id: "x" }, { id: "y" }, { id: "z" }];
    fx.algo = [{ id: "SHOULD_NOT_APPEAR" }];
    const out = await getRelatedProducts(P, 2);
    expect(out.map((x) => (x as { id: string }).id)).toEqual(["x", "y"]);
  });

  it("a curated pick whose product no longer exists is skipped, not rendered as a hole", async () => {
    fx.rel = [{ related_product_id: "gone", sort_order: 0 }, { related_product_id: "x", sort_order: 1 }];
    fx.cards = [{ id: "x" }]; // "gone" not returned by the products fetch
    fx.algo = [{ id: "a" }];
    const out = await getRelatedProducts(P, 4);
    expect(out.map((x) => (x as { id: string }).id)).toEqual(["x", "a"]);
  });
});
