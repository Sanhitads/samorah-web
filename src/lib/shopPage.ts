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

/** Product types the catalogue will grow into. Reserved — the Shop filters by
 *  type internally, but the UI stays hidden until more categories exist. */
export const PRODUCT_TYPES = ["candle", "room_spray", "linen_spray", "wax_melt", "air_freshener"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

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
  created_at?: string | null;
  /** Reserved for future product-type filtering; absent today → treated as candle. */
  product_type?: string | null;
  collection?: { slug: string; name: string; volume: string | null } | null;
  variants?: ShopVariantLike[] | null;
  product_images?: ImageLike[] | null;
}

export type ShopSort = "featured" | "newest" | "price-asc" | "price-desc";

export interface ShopFilterOption {
  key: string; // "all" | collection slug | vessel enum
  label: string; // "All" | "Dessert Chapter" | "Glass"
  volume?: string | null; // "Vol. I" — chapter filters render it above the label
  href: string;
  active: boolean;
  count: number;
}
export interface ShopSortOption {
  key: ShopSort;
  label: string;
  href: string;
  active: boolean;
}

export interface ShopView {
  cards: ProductCardModel[];
  total: number; // total products in the active product-type
  shown: number; // after chapter × vessel filters
  chapters: ShopFilterOption[];
  vessels: ShopFilterOption[];
  sorts: ShopSortOption[];
  activeChapter: string; // "all" | slug
  activeVessel: string; // "all" | vessel enum
  activeSort: ShopSort;
}

// Chapter identities for the filter row (volume comes from the collection row).
const CHAPTER_SHORT: Record<string, { order: number }> = {
  "dessert-chapter": { order: 1 },
  "the-wild-within": { order: 2 },
  "mood-library": { order: 3 },
  "nature-chapter": { order: 4 },
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
export function canonicalShopUrl(params: { chapter?: string; vessel?: string; sort?: string }): string {
  const sort: ShopSort = isSort(params.sort) ? params.sort : "featured";
  return href(resolveChapter(params.chapter), params.vessel ?? "all", sort);
}

/** Build a `/shop` query string, dropping defaults (chapter=all, vessel=all, sort=featured). */
function href(chapter: string, vessel: string, sort: ShopSort): string {
  const params = new URLSearchParams();
  if (chapter !== "all") params.set("chapter", chapter);
  if (vessel !== "all") params.set("vessel", vessel);
  if (sort !== "featured") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/shop?${qs}` : "/shop";
}

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

function toCard(p: ShopProductInput): ProductCardModel {
  const img = primaryImage(p.product_images);
  const chapter = p.collection;
  return {
    slug: p.slug,
    name: p.name,
    tagline: p.tagline ?? null,
    media: imageMedia(img?.url ?? GRADIENT, img?.alt_text ?? p.name, "portrait"),
    commerce: toProjection(p),
    edition: chapter?.volume ? chapter.volume.toUpperCase() : undefined,
    collectionType: chapter?.name ?? undefined,
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
  params: { chapter?: string; vessel?: string; sort?: string; type?: string } = {},
): ShopView {
  const activeSort: ShopSort = isSort(params.sort) ? params.sort : "featured";
  const activeChapter = resolveChapter(params.chapter); // aliases → canonical slug
  const activeVessel = params.vessel ?? "all";

  // Product-type is reserved: filter only when explicitly asked, treating a
  // missing product_type as "candle" (today's whole catalogue).
  const typed = params.type
    ? products.filter((p) => (p.product_type ?? "candle") === params.type)
    : products;

  // Chapter options — counted within the active vessel; in volume order.
  const forChapters = typed.filter((p) => matchesVessel(p, activeVessel));
  const chapterMap = new Map<string, { name: string; volume: string | null; order: number; count: number }>();
  for (const p of forChapters) {
    const c = p.collection;
    if (!c) continue;
    const order = CHAPTER_SHORT[c.slug]?.order ?? 99;
    const entry = chapterMap.get(c.slug) ?? { name: c.name, volume: c.volume, order, count: 0 };
    entry.count += 1;
    chapterMap.set(c.slug, entry);
  }
  const chapters: ShopFilterOption[] = [
    { key: "all", label: "All", href: href("all", activeVessel, activeSort), active: activeChapter === "all", count: forChapters.length },
    ...[...chapterMap.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([slug, meta]) => ({
        key: slug,
        label: meta.name,
        volume: meta.volume,
        href: href(slug, activeVessel, activeSort),
        active: activeChapter === slug,
        count: meta.count,
      })),
  ];

  // Vessel options — counted within the active chapter.
  const forVessels = typed.filter((p) => matchesChapter(p, activeChapter));
  const vessels: ShopFilterOption[] = [
    { key: "all", label: "All", href: href(activeChapter, "all", activeSort), active: activeVessel === "all", count: forVessels.length },
    ...LAUNCH_VESSELS.map((v) => ({
      key: v.key,
      label: v.label,
      href: href(activeChapter, v.key, activeSort),
      active: activeVessel === v.key,
      count: forVessels.filter((p) => matchesVessel(p, v.key)).length,
    })),
  ];

  const sorts: ShopSortOption[] = (Object.keys(SORT_LABEL) as ShopSort[]).map((key) => ({
    key,
    label: SORT_LABEL[key],
    href: href(activeChapter, activeVessel, key),
    active: activeSort === key,
  }));

  const filtered = typed.filter((p) => matchesChapter(p, activeChapter) && matchesVessel(p, activeVessel));
  const cards = sortProducts(filtered, activeSort).map(toCard);

  return {
    cards,
    total: typed.length,
    shown: cards.length,
    chapters,
    vessels,
    sorts,
    activeChapter,
    activeVessel,
    activeSort,
  };
}
