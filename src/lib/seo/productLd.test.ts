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

  it("truthfulness: an UNPRICED / coming-soon product emits NO Offer and never ₹0 + InStock", () => {
    const ld = productLd({ name: "Coming Soon", slug: "coming-soon", gallery: [], priceLabel: "", variants: [] });
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers).toBeUndefined(); // no ₹0 Offer
    expect(JSON.stringify(ld)).not.toContain("InStock"); // no fabricated availability
  });

  it("truthfulness: a priced product with every variant out of stock reports OutOfStock (no fabricated InStock)", () => {
    const ld = productLd({ name: "Sold Out", slug: "sold-out", gallery: [], priceLabel: "₹999", variants: [{ price: 999, inStock: false }] });
    const offers = ld.offers as Record<string, unknown>;
    expect(offers.price).toBe(999);
    expect(offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("archived/discontinued: emits NO Offer at all (no price, no availability, no InStock) — the retired page shows none", () => {
    const ld = productLd({ name: "Retired Edition", slug: "retired", gallery: [], priceLabel: "₹1,200", variants: [{ price: 1200, inStock: true }], discontinued: true });
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers).toBeUndefined(); // no commercial offer on a non-purchasable page
    const s = JSON.stringify(ld);
    expect(s).not.toContain("Offer");
    expect(s).not.toContain("InStock");
    expect(s).not.toContain("1200"); // never an invented/historical price
    // the Product itself stays intact (name/url/brand) so the retired page still carries valid markup
    expect(ld.name).toBe("Retired Edition");
    expect(String(ld.url)).toMatch(/\/shop\/retired$/);
    expect((ld.brand as Record<string, unknown>).name).toBe("Samorah");
  });

  it("emits absolute product url, itemCondition and the canonical 'Samorah' brand casing", () => {
    const ld = productLd({ name: "Amber", slug: "amber", gallery: [], priceLabel: "₹1,000", variants: [{ price: 1000, inStock: true }], sku: "SAM-AMBER-200" });
    expect(ld.sku).toBe("SAM-AMBER-200");
    expect(String(ld.url)).toMatch(/\/shop\/amber$/);
    expect((ld.brand as Record<string, unknown>).name).toBe("Samorah"); // not all-caps COMMERCE casing
    expect((ld.offers as Record<string, unknown>).itemCondition).toBe("https://schema.org/NewCondition");
  });
});

describe("productLd — SKU is optional and never invented (item 4)", () => {
  const base = { name: "X", slug: "x", gallery: [], priceLabel: "₹999", variants: [{ price: 999, inStock: true }] };
  it("omits `sku` for null / undefined / empty / whitespace-only values", () => {
    for (const sku of [null, undefined, "", "   ", "\t\n "] as (string | null | undefined)[]) {
      const ld = productLd({ ...base, sku });
      expect(ld.sku, `sku=${JSON.stringify(sku)}`).toBeUndefined();
      expect(JSON.stringify(ld)).not.toContain('"sku"');
    }
  });
  it("renders a genuine SKU value unchanged", () => {
    expect(productLd({ ...base, sku: "SAM-CAN-007" }).sku).toBe("SAM-CAN-007");
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
