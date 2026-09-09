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

describe("shop PLP — a 'Loved' (bestseller) product sorts up with featured", () => {
  const p = (slug: string, order: number, extra: Partial<ShopProductInput> = {}): ShopProductInput => ({
    id: slug, slug, name: slug, price: 599, sale_price: null, product_type: "room_spray",
    is_hero: false, is_featured: false, is_bestseller: false, created_at: "2026-01-01", display_order: order,
    collection: { slug: "e", name: "E", volume: "Vol. I" }, variants: [], product_images: [], ...extra,
  });
  it("ranks the Loved product first even when its display_order is last", () => {
    const catalog = [p("a", 1), p("loved", 9, { is_bestseller: true }), p("b", 2)];
    expect(buildShopPage(catalog, {}).cards.map((c) => c.slug)).toEqual(["loved", "a", "b"]);
  });
  it("hero still leads over a Loved product", () => {
    const catalog = [p("loved", 1, { is_bestseller: true }), p("hero", 9, { is_hero: true })];
    expect(buildShopPage(catalog, {}).cards.map((c) => c.slug)).toEqual(["hero", "loved"]);
  });
});

describe("shop PLP — default order follows display_order (Vol I.1 → I.4, never reversed)", () => {
  const air = (slug: string, order: number, createdAt: string): ShopProductInput => ({
    id: slug, slug, name: slug, price: 599, sale_price: null, product_type: "room_spray",
    is_hero: false, is_featured: false, created_at: createdAt, display_order: order,
    collection: { slug: "the-everyday", name: "The Everyday", volume: "Vol. I" },
    variants: [], product_images: [],
  });
  it("orders by display_order ascending in the default (featured) view", () => {
    // Given newest-first would reverse them (open-window is oldest), display_order must win.
    const catalog = [
      air("after-lights", 4, "2026-04-01"),
      air("fresh-fold", 3, "2026-03-01"),
      air("slow-evening", 2, "2026-02-01"),
      air("open-window", 1, "2026-01-01"),
    ];
    const slugs = buildShopPage(catalog, {}).cards.map((c) => c.slug);
    expect(slugs).toEqual(["open-window", "slow-evening", "fresh-fold", "after-lights"]);
  });
  it("falls back to oldest-first (not newest-first) when display_order ties", () => {
    const catalog = [
      air("d", 0, "2026-04-01"), air("c", 0, "2026-03-01"), air("b", 0, "2026-02-01"), air("a", 0, "2026-01-01"),
    ];
    expect(buildShopPage(catalog, {}).cards.map((c) => c.slug)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("shop PLP — 'From' price uses the lowest variant (not the base price)", () => {
  const priced = (slug: string, type: "candle" | "room_spray" | "linen_spray", base: number, variantPrices: number[]): ShopProductInput => ({
    id: slug, slug, name: slug, price: base, sale_price: null, product_type: type,
    collection: { slug: "c", name: "C", volume: "Vol. I" },
    variants: variantPrices.map((price) => ({ vessel_type: "glass", is_active: true, price, sale_price: null })),
    product_images: [],
  });
  const cardFor = (p: ShopProductInput) => buildShopPage([p], {}).cards.find((c) => c.slug === p.slug);

  it("candle card shows the 100g (cheapest active variant), not ₹899", () => {
    expect(cardFor(priced("wf", "candle", 899, [899, 580, 720]))?.priceLabel).toBe("From ₹580");
  });
  it("Room Freshener card is variant-derived too", () => {
    expect(cardFor(priced("rf", "room_spray", 650, [650, 420]))?.priceLabel).toBe("From ₹420");
  });
  it("Linen Freshener card is variant-derived too", () => {
    expect(cardFor(priced("lf", "linen_spray", 700, [700, 480]))?.priceLabel).toBe("From ₹480");
  });
  it("a product with no priced variants falls back to its own price", () => {
    expect(cardFor(priced("x", "candle", 599, []))?.priceLabel).toBe("From ₹599");
  });
  it("a sale price on a variant wins for that variant", () => {
    const p = priced("s", "candle", 899, [899]);
    p.variants![0].sale_price = 499;
    expect(cardFor(p)?.priceLabel).toBe("From ₹499");
  });
});

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

describe("shop PLP — highlight (Best Sellers / New Arrivals) filter", () => {
  const FLAGGED: ShopProductInput[] = [
    { ...candle("a", "dessert-chapter", "Dessert Chapter", ["glass"]), is_bestseller: true },
    { ...candle("b", "mood-library", "Mood Library", ["glass"]), is_new_arrival: true },
    candle("c", "nature-chapter", "Nature Chapter", ["glass"]),
  ];

  it("tag=bestseller → only bestsellers", () => {
    const v = buildShopPage(FLAGGED, { tag: "bestseller" });
    expect(v.shown).toBe(1);
    expect(v.cards[0].slug).toBe("a");
    expect(v.activeTag).toBe("bestseller");
    expect(v.activeCount).toBe(1);
  });

  it("tag=new-arrival (and the ?tag=new-arrivals alias) → only new arrivals", () => {
    expect(buildShopPage(FLAGGED, { tag: "new-arrival" }).cards.map((c) => c.slug)).toEqual(["b"]);
    expect(buildShopPage(FLAGGED, { tag: "new-arrivals" }).cards.map((c) => c.slug)).toEqual(["b"]);
  });

  it("tagOptions only surface tags that have products", () => {
    const keys = buildShopPage(FLAGGED, {}).tagOptions.map((o) => o.key);
    expect(keys).toEqual(["all", "bestseller", "new-arrival"]);
    // none flagged → no highlight options
    expect(buildShopPage([candle("x", "dessert-chapter", "Dessert Chapter", ["glass"])], {}).tagOptions.map((o) => o.key)).toEqual(["all"]);
  });

  it("highlight combines with chapter/type", () => {
    const v = buildShopPage(FLAGGED, { tag: "bestseller", chapter: "mood-library" });
    expect(v.shown).toBe(0); // 'a' is a bestseller but in dessert-chapter
    expect(v.activeCount).toBe(2);
  });
});
