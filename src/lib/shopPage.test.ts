import { describe, it, expect } from "vitest";
import { buildShopPage, type ShopProductInput } from "@/lib/shopPage";

const candle = (slug: string, chapterSlug: string, chapterName: string, vessels: string[]): ShopProductInput => ({
  id: slug,
  slug,
  name: slug,
  price: 899,
  sale_price: null,
  product_type: "candle",
  collection: { slug: chapterSlug, name: chapterName, volume: "Vol. I" },
  variants: vessels.map((v) => ({ vessel_type: v, is_active: true })),
  product_images: [],
});
const spray = (slug: string, type: "room_spray" | "linen_spray"): ShopProductInput => ({
  id: slug,
  slug,
  name: slug,
  price: 599,
  sale_price: null,
  product_type: type,
  collection: { slug: "the-everyday", name: "The Everyday", volume: "Volume I" },
  variants: [],
  product_images: [],
});

const CATALOG: ShopProductInput[] = [
  candle("kashmiri-chai", "dessert-chapter", "Dessert Chapter", ["glass", "ceramic"]),
  candle("midnight-amethyst", "mood-library", "Mood Library", ["glass"]),
  spray("open-window", "room_spray"),
  spray("fresh-fold", "linen_spray"),
];

describe("shop PLP — type × chapter × vessel filters", () => {
  it("All — every published type shows (candles + sprays)", () => {
    const v = buildShopPage(CATALOG, {});
    expect(v.shown).toBe(4);
    expect(v.activeCount).toBe(0);
    expect(v.showVessel).toBe(true); // 'all' includes candles
  });

  it("SHOP-002 — filter by Type=candle → only candles; vessel facet shown", () => {
    const v = buildShopPage(CATALOG, { type: "candle" });
    expect(v.shown).toBe(2);
    expect(v.showVessel).toBe(true);
    expect(v.activeCount).toBe(1);
  });

  it("Type=room_spray → sprays only; vessel facet hidden (candles-only)", () => {
    const v = buildShopPage(CATALOG, { type: "room_spray" });
    expect(v.shown).toBe(1);
    expect(v.cards[0].slug).toBe("open-window");
    expect(v.showVessel).toBe(false);
  });

  it("SHOP-001 — filter by Chapter", () => {
    expect(buildShopPage(CATALOG, { chapter: "dessert-chapter" }).shown).toBe(1);
    // friendly alias resolves to canonical slug
    expect(buildShopPage(CATALOG, { chapter: "dessert" }).shown).toBe(1);
    expect(buildShopPage(CATALOG, { chapter: "the-everyday" }).shown).toBe(2);
  });

  it("Vessel applies only to candles (air excluded when a vessel is chosen)", () => {
    const v = buildShopPage(CATALOG, { vessel: "glass" });
    expect(v.shown).toBe(2); // kashmiri + midnight (glass); sprays have no vessel
  });

  it("SHOP-003 — combined Type + Chapter + Vessel", () => {
    const v = buildShopPage(CATALOG, { type: "candle", chapter: "mood-library", vessel: "glass" });
    expect(v.shown).toBe(1);
    expect(v.cards[0].slug).toBe("midnight-amethyst");
    expect(v.activeCount).toBe(3);
  });

  it("hyphen type alias resolves (?type=room-spray)", () => {
    expect(buildShopPage(CATALOG, { type: "room-spray" }).shown).toBe(1);
  });
});
