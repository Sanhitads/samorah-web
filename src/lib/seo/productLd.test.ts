import { describe, it, expect } from "vitest";
import { productLd, airProductLd } from "./productLd";

describe("productLd — candle Product + Offer schema (P0-7)", () => {
  it("single price → Offer with InStock", () => {
    const ld = productLd({ name: "Amber & Oud", slug: "amber-oud", description: "Warm", gallery: [{ src: "/img/a.jpg" }], priceLabel: "₹1,240", variants: [{ price: 1240, inStock: true }] });
    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toBe("Amber & Oud");
    const offers = ld.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("Offer");
    expect(offers.price).toBe(1240);
    expect(offers.availability).toBe("https://schema.org/InStock");
    expect((ld.brand as Record<string, unknown>)["@type"]).toBe("Brand");
  });
  it("multiple prices → AggregateOffer with low/high", () => {
    const ld = productLd({ name: "X", slug: "x", gallery: [], priceLabel: "", variants: [{ price: 1000, inStock: false }, { price: 1500, inStock: true }] });
    const offers = ld.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe(1000);
    expect(offers.highPrice).toBe(1500);
    expect(offers.availability).toBe("https://schema.org/InStock"); // any in stock
  });
  it("drops gradient placeholder images", () => {
    const ld = productLd({ name: "X", slug: "x", gallery: [{ src: "gradient:grad-air" }], priceLabel: "", variants: [{ price: 599, inStock: true }] });
    expect(ld.image).toBeUndefined();
  });
});

describe("airProductLd — air/room/linen Product schema via the SHARED builder (P0-7)", () => {
  it("builds a valid Product + Offer from canonical Hours data", () => {
    const ld = airProductLd({ name: "Open Window", productSlug: "open-window", price: 599, priceLabel: "From ₹599", cardImage: "/img/open.jpg" }, "The unnoticed moments.");
    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toBe("Open Window");
    expect(ld.description).toBe("The unnoticed moments.");
    const offers = ld.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("Offer");
    expect(offers.price).toBe(599);
    expect(offers.availability).toBe("https://schema.org/InStock");
    expect((ld.image as string[])[0]).toMatch(/open\.jpg$/);
  });
  it("no image when only a gradient placeholder is available", () => {
    const ld = airProductLd({ name: "Y", productSlug: "y", price: 599, priceLabel: "₹599", cardImage: "gradient:grad-air" });
    expect(ld.image).toBeUndefined();
  });
});
