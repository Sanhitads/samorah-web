/**
 * Shop PLP builder (Template C) — turns the active-product rows into a filtered,
 * sorted list of ProductCard models plus the filter/sort options the page renders
 * as links. Filters combine: Chapter × Vessel (× Product Type, reserved). Pure
 * (no I/O); structural input types keep it decoupled from the generated DB Row
 * types. Honors the commerce boundary — cards carry a ProductCommerceProjection.
 */
import { effectivePrice, formatPrice, type Priceable } from "@/lib/pricing";
import { primaryImage, type ImageLike } from "@/lib/product";
import { toProjection } from "@/lib/chapterPage";
import type { ProductCardModel } from "@/components/ui/ProductCard";
import { imageMedia } from "@/lib/presentation";

const GRADIENT = "gradient:grad-chai";

/** Product types the catalogue supports (present + future). */
export const PRODUCT_TYPES = ["candle", "room_spray", "linen_spray", "wax_melt", "gift_set", "accessory"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** Per-card product-type label (shown on every card so mixed listings stay clear). */
export const PRODUCT_TYPE_LABEL: Record<string, string> = {
  candle: "Scented Candle",
  room_spray: "Room Spray",
  linen_spray: "Linen Spray",
  wax_melt: "Wax Melt",
  gift_set: "Gift Set",
  accessory: "Accessory",
};

/** Product-type filter chips (order + display). `future` chips render disabled. */
const TYPE_FILTER: { key: string; label: string; future?: boolean }[] = [
  { key: "candle", label: "Candles" },
  { key: "room_spray", label: "Room Sprays" },
  { key: "linen_spray", label: "Linen Sprays" },
  { key: "wax_melt", label: "Wax Melts", future: true },
  { key: "gift_set", label: "Gift Sets", future: true },
  { key: "accessory", label: "Accessories", future: true },
];

/** Only candles carry a vessel — the vessel facet shows for these types only. */
const VESSEL_TYPES = new Set(["all", "candle"]);

export interface ShopVariantLike {
  vessel_type: string | null;
  is_active: boolean;
}

export interface ShopProductInput extends Priceable {
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  is_hero?: boolean | null;
  is_featured?: boolean | null;
  is_bestseller?: boolean | null;
  is_new_arrival?: boolean | null;
  created_at?: string | null;
  /** Reserved for future product-type filtering; absent today → treated as candle. */
  product_type?: string | null;
  collection?: { slug: string; name: string; volume: string | null } | null;
  variants?: ShopVariantLike[] | null;
  product_images?: ImageLike[] | null;
}

export type ShopSort = "featured" | "newest" | "price-asc" | "price-desc";

export interface ShopFilterOption {
  key: string; // "all" | collection slug | vessel enum | product type
  label: string; // "All" | "Dessert Chapter" | "Glass" | "Room Sprays"
  volume?: string | null; // "Vol. I" — chapter filters render it above the label
  href: string;
  active: boolean;
  count: number;
  disabled?: boolean; // future product types (no products yet)
}
export interface ShopSortOption {
  key: ShopSort;
  label: string;
  href: string;
  active: boolean;
}

/** A choice in the Refine drawer (radio-style; no counts — the grid is the hero). */
export interface ShopFilterChoice {
  key: string; // "all" | value
  label: string; // "All" | "Vol. I — Dessert Chapter" | "Glass"
}

export interface ShopView {
  cards: ProductCardModel[];
  total: number; // total published products (all types)
  shown: number; // after type × chapter × vessel filters
  sorts: ShopSortOption[];
  // Full option lists for the Refine drawer (radio-style, not cross-filtered).
  typeOptions: ShopFilterChoice[];
  chapterOptions: ShopFilterChoice[];
  vesselOptions: ShopFilterChoice[];
  tagOptions: ShopFilterChoice[]; // Highlights: All / Best Sellers / New Arrivals
  activeType: string; // "all" | product type
  activeChapter: string; // "all" | slug
  activeVessel: string; // "all" | vessel enum
  activeTag: string; // "all" | "bestseller" | "new-arrival"
  activeSort: ShopSort;
  activeCount: number; // non-default filters (type/chapter/vessel/tag) → "Refine (N)"
  showVessel: boolean; // vessel section shows for candles / all only
}

// Chapter identities for the filter row (volume comes from the collection row).
const CHAPTER_SHORT: Record<string, { order: number; short?: string }> = {
  "dessert-chapter": { order: 1 },
  "the-wild-within": { order: 2 },
  "mood-library": { order: 3 },
  "nature-chapter": { order: 4 },
  "the-everyday": { order: 5, short: "The Everyday" }, // the Air volume
};

// Friendly chapter aliases → canonical collection slugs. Shareable/typed URLs
// like /shop?chapter=dessert resolve here; the filter links + canonical URL keep
// the slug form for SEO.
const CHAPTER_ALIAS: Record<string, string> = {
  dessert: "dessert-chapter",
  wild: "the-wild-within",
  mood: "mood-library",
  nature: "nature-chapter",
};
const resolveChapter = (v?: string): string => (v ? CHAPTER_ALIAS[v] ?? v : "all");

// Friendly type aliases (hyphen → underscore) so shared URLs like
// /shop?type=room-spray resolve. The drawer emits the canonical underscore form.
const TYPE_ALIAS: Record<string, string> = {
  "room-spray": "room_spray",
  "linen-spray": "linen_spray",
  "wax-melt": "wax_melt",
  "gift-set": "gift_set",
};
const resolveType = (v?: string): string => (v ? TYPE_ALIAS[v] ?? v : "all");

// Highlight facet — editorially-flagged lists (Best Sellers, New Arrivals). Driven by the
// is_bestseller / is_new_arrival merchandising flags, so the admin controls what appears.
const TAG_FILTER: { key: string; label: string }[] = [
  { key: "bestseller", label: "Best Sellers" },
  { key: "new-arrival", label: "New Arrivals" },
];
const TAG_ALIAS: Record<string, string> = {
  "best-seller": "bestseller", bestsellers: "bestseller", "best-sellers": "bestseller",
  "new-arrivals": "new-arrival", new: "new-arrival",
};
const resolveTag = (v?: string): string => (v ? TAG_ALIAS[v] ?? v : "all");
const matchesTag = (p: ShopProductInput, tag: string) =>
  tag === "all" ||
  (tag === "bestseller" ? !!p.is_bestseller : tag === "new-arrival" ? !!p.is_new_arrival : true);

// Vessels available at launch (terracotta is future — not surfaced yet).
const LAUNCH_VESSELS: { key: string; label: string }[] = [
  { key: "glass", label: "Glass" },
  { key: "ceramic", label: "Ceramic" },
];

const SORT_LABEL: Record<ShopSort, string> = {
  featured: "Featured",
  newest: "Newest",
  "price-asc": "Price · Low to High",
  "price-desc": "Price · High to Low",
};

const isSort = (v: string | undefined): v is ShopSort =>
  v === "featured" || v === "newest" || v === "price-asc" || v === "price-desc";

/** Canonical `/shop` URL for a set of (possibly aliased) params — for rel=canonical. */
export function canonicalShopUrl(params: { type?: string; chapter?: string; vessel?: string; sort?: string; tag?: string }): string {
  const sort: ShopSort = isSort(params.sort) ? params.sort : "featured";
  return href(resolveType(params.type), resolveChapter(params.chapter), params.vessel ?? "all", sort, resolveTag(params.tag));
}

/** Build a `/shop` query string, dropping defaults (type/chapter/vessel/tag=all, sort=featured). */
function href(type: string, chapter: string, vessel: string, sort: ShopSort, tag: string = "all"): string {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (chapter !== "all") params.set("chapter", chapter);
  if (vessel !== "all") params.set("vessel", vessel);
  if (tag !== "all") params.set("tag", tag);
  if (sort !== "featured") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/shop?${qs}` : "/shop";
}

const productTypeOf = (p: ShopProductInput) => p.product_type ?? "candle";
const matchesType = (p: ShopProductInput, type: string) => type === "all" || productTypeOf(p) === type;
const matchesChapter = (p: ShopProductInput, chapter: string) =>
  chapter === "all" || p.collection?.slug === chapter;
const matchesVessel = (p: ShopProductInput, vessel: string) =>
  vessel === "all" || (p.variants ?? []).some((v) => v.is_active && v.vessel_type === vessel);

function sortProducts(list: ShopProductInput[], sort: ShopSort): ShopProductInput[] {
  const byNewest = (a: ShopProductInput, b: ShopProductInput) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? "");
  const out = [...list];
  switch (sort) {
    case "newest":
      return out.sort(byNewest);
    case "price-asc":
      return out.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    case "price-desc":
      return out.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    case "featured":
    default:
      return out.sort((a, b) => {
        const rank = (p: ShopProductInput) => (p.is_hero ? 0 : p.is_featured ? 1 : 2);
        return rank(a) - rank(b) || byNewest(a, b);
      });
  }
}

function toCard(p: ShopProductInput, editions?: ReadonlyMap<string, { edition: string }>): ProductCardModel {
  const img = primaryImage(p.product_images);
  const chapter = p.collection;
  const type = productTypeOf(p);
  // Prefer the full "NO. IV.1" numbering; fall back to the volume when unmapped.
  const edition = editions?.get(p.slug)?.edition ?? (chapter?.volume ? chapter.volume.toUpperCase() : undefined);
  return {
    slug: p.slug,
    name: p.name,
    tagline: p.tagline ?? null,
    media: imageMedia(img?.url ?? GRADIENT, img?.alt_text ?? p.name, "portrait"),
    commerce: toProjection(p),
    edition,
    // The chapter name grounds the card in its collection (product type is a
    // Refine filter, not card noise).
    collectionType: chapter?.name ?? undefined,
    // Air products are sprays within one chapter — surface the category so a
    // mixed Shop listing reads clearly (candles omit it; their chapter suffices).
    productTypeLabel:
      type === "room_spray" || type === "linen_spray" ? PRODUCT_TYPE_LABEL[type] : undefined,
    priceLabel: formatPrice(p).current,
    cta: { label: "View", href: `/shop/${p.slug}` },
  };
}

/**
 * Compose the Shop PLP view from the product rows + the URL params. Chapter and
 * Vessel combine; each filter's counts reflect the *other* active filter, so the
 * numbers always match what selecting that option would show.
 */
export function buildShopPage(
  products: ShopProductInput[],
  params: { chapter?: string; vessel?: string; sort?: string; type?: string; tag?: string } = {},
  editions?: ReadonlyMap<string, { edition: string }>,
): ShopView {
  const activeSort: ShopSort = isSort(params.sort) ? params.sort : "featured";
  const activeType = resolveType(params.type); // hyphen aliases → canonical
  const activeChapter = resolveChapter(params.chapter); // aliases → canonical slug
  const activeTag = resolveTag(params.tag); // "all" | bestseller | new-arrival
  const showVessel = VESSEL_TYPES.has(activeType); // vessel applies to candles only
  const activeVessel = showVessel ? params.vessel ?? "all" : "all";

  // Product-Type facet — counted within the active chapter; switching type resets
  // vessel (a candle-only refinement). Future types render disabled at 0.
  // ── Full option lists for the Refine drawer (not cross-filtered) ──
  // Types that actually have products (future types appear once seeded).
  const typeOptions: ShopFilterChoice[] = [
    { key: "all", label: "All" },
    ...TYPE_FILTER.filter((t) => products.some((p) => productTypeOf(p) === t.key)).map((t) => ({
      key: t.key,
      label: t.label,
    })),
  ];

  // Every chapter present, in volume order, labelled "Vol. I — Dessert Chapter".
  const chapterMap = new Map<string, { name: string; volume: string | null; order: number }>();
  for (const p of products) {
    const c = p.collection;
    if (!c || chapterMap.has(c.slug)) continue;
    chapterMap.set(c.slug, { name: c.name, volume: c.volume, order: CHAPTER_SHORT[c.slug]?.order ?? 99 });
  }
  const chapterOptions: ShopFilterChoice[] = [
    { key: "all", label: "All" },
    ...[...chapterMap.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([slug, meta]) => ({
        key: slug,
        label: meta.volume ? `${meta.volume} — ${meta.name}` : meta.name,
      })),
  ];

  const vesselOptions: ShopFilterChoice[] = [
    { key: "all", label: "All" },
    ...LAUNCH_VESSELS.map((v) => ({ key: v.key, label: v.label })),
  ];

  // Highlights facet — only surface a tag when products carry that flag.
  const tagOptions: ShopFilterChoice[] = [
    { key: "all", label: "All" },
    ...TAG_FILTER.filter((t) => products.some((p) => matchesTag(p, t.key))).map((t) => ({ key: t.key, label: t.label })),
  ];

  const sorts: ShopSortOption[] = (Object.keys(SORT_LABEL) as ShopSort[]).map((key) => ({
    key,
    label: SORT_LABEL[key],
    href: href(activeType, activeChapter, activeVessel, key, activeTag),
    active: activeSort === key,
  }));

  const filtered = products.filter(
    (p) =>
      matchesType(p, activeType) &&
      matchesChapter(p, activeChapter) &&
      matchesVessel(p, activeVessel) &&
      matchesTag(p, activeTag),
  );
  const cards = sortProducts(filtered, activeSort).map((p) => toCard(p, editions));

  const activeCount =
    (activeType !== "all" ? 1 : 0) + (activeChapter !== "all" ? 1 : 0) + (activeVessel !== "all" ? 1 : 0) + (activeTag !== "all" ? 1 : 0);

  return {
    cards,
    total: products.length,
    shown: cards.length,
    sorts,
    typeOptions,
    chapterOptions,
    vesselOptions,
    tagOptions,
    activeType,
    activeChapter,
    activeVessel,
    activeTag,
    activeSort,
    activeCount,
    showVessel,
  };
}
