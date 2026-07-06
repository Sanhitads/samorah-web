import { describe, it, expect, beforeEach } from "vitest";
import {
  useCartStore,
  selectCartCount,
  selectCartSubtotal,
  selectCompositionDiscount,
  type CartProduct,
} from "@/store/useCartStore";

const product = (id: string, price: number, compositionId?: string): CartProduct => ({
  id,
  slug: id,
  name: id,
  price,
  compositionId,
});

const reset = () => useCartStore.setState({ items: [] });
const S = () => useCartStore.getState();

describe("cart store", () => {
  beforeEach(reset);

  it("CART-001/002 — add merges by key; qty increments", () => {
    S().addItem(product("a", 899), "Glass", "100g");
    S().addItem(product("a", 899), "Glass", "100g"); // same variant → merge
    expect(S().items).toHaveLength(1);
    expect(S().items[0].qty).toBe(2);
    expect(selectCartCount(S())).toBe(2);
    expect(selectCartSubtotal(S())).toBe(899 * 2);
  });

  it("distinct variants are separate lines", () => {
    S().addItem(product("a", 899), "Glass", "100g");
    S().addItem(product("a", 999), "Ceramic", "200g");
    expect(S().items).toHaveLength(2);
  });

  it("CART-003 — remove empties the cart; qty 0 drops the line", () => {
    S().addItem(product("a", 899), "Glass", "100g");
    S().updateQty(S().items[0].key, 0);
    expect(S().items).toHaveLength(0);
  });

  it("PROMO-001/COMP-005 — composition discount only while the set is complete", () => {
    ["a", "b", "c"].forEach((id) => S().addItem(product(id, 580, "comp-1"), "Glass", "100g"));
    expect(selectCompositionDiscount(S())).toBe(261); // (580−493)*3, rupees
    // remove one → group no longer complete → discount lapses
    S().removeItem(S().items[0].key);
    expect(selectCompositionDiscount(S())).toBe(0);
  });

  it("composition lines never merge with a normal purchase of the same variant", () => {
    S().addItem(product("a", 580), "Glass", "100g"); // normal
    S().addItem(product("a", 580, "comp-1"), "Glass", "100g"); // composition
    expect(S().items).toHaveLength(2);
  });
});
