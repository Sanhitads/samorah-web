import { describe, it, expect } from "vitest";
import { buildProductPage, galleryForVariant, type ProductInput, type ProductGalleryImage } from "@/lib/productPage";

/* eslint-disable @typescript-eslint/no-explicit-any */

const variant = (id: string, vessel: string, size: string, over: any = {}) => ({
  id, sku: `SKU-${id}`, variant_name: null, vessel_type: vessel, size_label: size,
  is_active: true, sort_order: 0, stock: 10, low_stock_threshold: 3, price: 895, sale_price: null, ...over,
});

const base = (images: any[], variants: any[]): ProductInput => ({
  id: "p1", slug: "kashmiri-chai", name: "Kashmiri Chai", tagline: null, price: 895,
  scent_group: null, fragrance_family: null, story: null, story_long: null,
  flame_persona: null, cultural_reference: null, lifestyle_use: null, mood_tags: null,
  burn_time: null, wax_blend: null, wick: null, collection: null,
  variants, product_images: images, fragrance_notes: null,
});

describe("buildProductPage — per-variant galleries", () => {
  it("is backward-compatible: images with no variant_id form the shared gallery, no per-variant map", () => {
    // The pre-existing shape — every image is variant_id-null — must render exactly as before.
    const view = buildProductPage(base(
      [{ url: "a.jpg", sort_order: 1, variant_id: null }, { url: "b.jpg", sort_order: 0, variant_id: null }],
      [variant("v1", "glass", "190g")],
    ));
    expect(view.gallery.map((g) => g.src)).toEqual(["b.jpg", "a.jpg"]); // sorted by sort_order
    expect(view.galleriesByVariant).toEqual({});
  });

  it("splits shared (variant_id null) from per-variant images and sorts each group", () => {
    const view = buildProductPage(base(
      [
        { url: "shared.jpg", sort_order: 0, variant_id: null },
        { url: "glass-a.jpg", sort_order: 1, variant_id: "v1" },
        { url: "glass-b.jpg", sort_order: 0, variant_id: "v1" },
        { url: "ceramic.jpg", sort_order: 0, variant_id: "v2" },
      ],
      [variant("v1", "glass", "190g"), variant("v2", "ceramic", "100g")],
    ));
    expect(view.gallery.map((g) => g.src)).toEqual(["shared.jpg"]); // shared = only the null-variant image
    expect(view.galleriesByVariant.v1.map((g) => g.src)).toEqual(["glass-b.jpg", "glass-a.jpg"]); // own, sorted
    expect(view.galleriesByVariant.v2.map((g) => g.src)).toEqual(["ceramic.jpg"]);
  });

  it("shows the gradient placeholder when a product has no images at all (unchanged)", () => {
    const view = buildProductPage(base([], [variant("v1", "glass", "190g")]));
    expect(view.gallery).toHaveLength(1);
    expect(view.gallery[0].src).toContain("gradient");
    expect(view.galleriesByVariant).toEqual({});
  });

  it("falls back the default view to any image when a product has only per-variant photos", () => {
    const view = buildProductPage(base(
      [{ url: "glass.jpg", sort_order: 0, variant_id: "v1" }],
      [variant("v1", "glass", "190g")],
    ));
    expect(view.gallery.map((g) => g.src)).toEqual(["glass.jpg"]); // never blank
    expect(view.galleriesByVariant.v1.map((g) => g.src)).toEqual(["glass.jpg"]);
  });
});

describe("galleryForVariant — which photos the gallery shows", () => {
  const def: ProductGalleryImage[] = [{ src: "shared.jpg", alt: "x" }];
  const byVar: Record<string, ProductGalleryImage[]> = { v1: [{ src: "glass.jpg", alt: "x" }] };

  it("shows the variant's own photos when it has them", () => {
    expect(galleryForVariant("v1", byVar, def)).toBe(byVar.v1);
  });
  it("falls back to the shared default when the variant has no photos", () => {
    expect(galleryForVariant("v2", byVar, def)).toBe(def);
    expect(galleryForVariant("v1", {}, def)).toBe(def);
  });
  it("falls back to the shared default when nothing is selected", () => {
    expect(galleryForVariant(null, byVar, def)).toBe(def);
  });
});
