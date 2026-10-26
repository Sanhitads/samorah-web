// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement as h } from "react";

/**
 * REGRESSION — the Size options must reflect ONLY the selected vessel's variants. Kashmiri Chai has
 * Ceramic = {100g, 150g} and Glass = {100g, 190g}; the old panel rendered the union {100g,150g,190g}
 * for both vessels, so 190g showed under Ceramic (and 150g under Glass) as an unbuyable "Unavailable"
 * combo. These pin: (a) only the vessel's sizes render, (b) switching vessel re-filters the sizes, and
 * (c) auto-corrects a now-unavailable size so the panel never sits on an unbuyable combo.
 */
vi.mock("@/lib/analytics/events", () => ({ trackSelectVariant: vi.fn() }));
vi.mock("@/components/product/AddToComposition", () => ({ AddToComposition: () => null }));

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ProductPurchasePanel, type PurchaseProduct } from "./ProductPurchasePanel";

afterEach(() => cleanup());

const v = (id: string, vessel: string, size: string, price: number) =>
  ({ id, vessel, size, price, priceLabel: `₹${price}`, burnTime: "", inStock: true, stockNote: null });

const product: PurchaseProduct = {
  id: "p1", slug: "kashmiri-chai", name: "Kashmiri Chai", chapterName: null,
  vessels: ["ceramic", "glass"], sizes: ["100g", "150g", "190g"],
  variants: [v("g100", "glass", "100g", 895), v("g190", "glass", "190g", 1199), v("c100", "ceramic", "100g", 895), v("c150", "ceramic", "150g", 1149)],
  defaultVariantId: "c100", priceLabel: "₹895",
};

const sizeOptions = () => screen.getAllByRole("button").map((b) => b.textContent ?? "").filter((t) => /^\d+g$/.test(t));
const vesselButton = (name: string) => screen.getAllByRole("button").find((b) => b.textContent === name)!;
const atcText = () => screen.getByText(/Add to bag|Unavailable|Sold out|Added to bag/).textContent;

describe("ProductPurchasePanel — Size options filtered by the selected vessel", () => {
  it("default vessel (Ceramic) shows only its sizes — 100g, 150g (NOT 190g)", () => {
    render(h(ProductPurchasePanel, { product }));
    expect(sizeOptions()).toEqual(["100g", "150g"]);
  });

  it("selecting Glass re-filters to 100g, 190g (NOT 150g)", () => {
    render(h(ProductPurchasePanel, { product }));
    fireEvent.click(vesselButton("glass"));
    expect(sizeOptions()).toEqual(["100g", "190g"]);
  });

  it("switching vessel off an unavailable size auto-corrects it (never lands on 'Unavailable')", () => {
    render(h(ProductPurchasePanel, { product }));
    fireEvent.click(screen.getByText("150g"));   // Ceramic · 150g (valid)
    expect(atcText()).toBe("Add to bag");
    fireEvent.click(vesselButton("glass"));       // Glass has no 150g → must snap to 100g
    expect(sizeOptions()).toEqual(["100g", "190g"]);
    expect(atcText()).toBe("Add to bag");         // not "Unavailable" — the combo stays buyable
  });

  it("a size common to both vessels is preserved across a vessel switch", () => {
    render(h(ProductPurchasePanel, { product })); // default Ceramic/100g
    fireEvent.click(vesselButton("glass"));        // 100g exists for Glass → stays 100g
    expect(atcText()).toBe("Add to bag");
    expect(sizeOptions()).toEqual(["100g", "190g"]);
  });
});
