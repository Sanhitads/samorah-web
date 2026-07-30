import { describe, it, expect } from "vitest";
import { buildCandleEditorial, type CandlePdpContent } from "@/lib/productEditorial";
import type { ProductPageView } from "@/lib/productPage";

/**
 * Batch C — product-type specifications. A wax tablet / reed diffuser renders through the candle PDP;
 * these tests pin that `content.specs` becomes a real, displayed grid section (reusing PlacementGrid),
 * lands after Craft, and is absent when no specs are set (so a normal candle is unchanged).
 */
const view = {
  id: "p1", slug: "drawer-tablet", name: "Kashmiri Chai Tablet", tagline: "For your drawers",
  chapterName: "Vol. I — Dessert", chapterSlug: "dessert", chapterHref: "/chapter/dessert",
  collectionType: "Core Collection", edition: "NO. I.1", scentGroup: "Gourmand", fragranceFamily: "Sweet",
  gallery: [{ src: "a.jpg", alt: "a" }], vessels: [], sizes: ["1 tablet"], variants: [], defaultVariantId: null,
  priceLabel: "₹280", details: [], notes: [],
  mood: { story: "A drawer that greets you.", tags: ["Warm"], persona: "", lifestyle: "In your wardrobe." },
  breadcrumb: [],
} as unknown as ProductPageView;

const findSpec = (sections: { id?: string }[]) => sections.find((s) => typeof s.id === "string" && s.id.startsWith("candle-specs"));

describe("buildCandleEditorial — type-specific specifications grid", () => {
  it("renders a specs grid section when content.specs is provided", () => {
    const content: CandlePdpContent = {
      specsHeading: "The details",
      specs: [{ label: "Longevity", value: "6–8 weeks" }, { label: "Where to place", value: "Drawers" }],
    };
    const sections = buildCandleEditorial({ view, related: [], content }) as unknown as { id: string; type: string; order: number; settings: { heading?: string; items?: { label: string; note: string }[] } }[];
    const spec = findSpec(sections) as (typeof sections)[number] | undefined;
    expect(spec).toBeTruthy();
    expect(spec!.type).toBe("PlacementGrid");
    expect(spec!.settings.heading).toBe("The details");
    expect(spec!.settings.items).toEqual([{ label: "Longevity", note: "6–8 weeks" }, { label: "Where to place", note: "Drawers" }]);
  });

  it("places the specs grid after Craft (order ≈ 5.5)", () => {
    const sections = buildCandleEditorial({ view, related: [], content: { specs: [{ label: "X", value: "Y" }] } }) as unknown as { id: string; order: number }[];
    const spec = findSpec(sections) as { order: number } | undefined;
    expect(spec!.order).toBeGreaterThanOrEqual(5.5);
    expect(spec!.order).toBeLessThan(6);
  });

  it("adds NO specs section when content has none (a normal candle is untouched)", () => {
    const sections = buildCandleEditorial({ view, related: [], content: {} }) as unknown as { id: string }[];
    expect(findSpec(sections)).toBeUndefined();
  });

  it("drops empty rows — a specs list of only blanks produces no section", () => {
    const sections = buildCandleEditorial({ view, related: [], content: { specs: [{ label: "  ", value: "" }] } }) as unknown as { id: string }[];
    expect(findSpec(sections)).toBeUndefined();
  });
});
