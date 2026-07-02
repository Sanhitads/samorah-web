/**
 * Shop PLP builder (Template C) — turns the active-product rows into a filtered,
 * sorted list of ProductCard models plus the filter/sort options the page renders
 * as links. Pure (no I/O); structural input types keep it decoupled from the
 * generated DB Row types. Honors the commerce boundary — cards carry a
 * ProductCommerceProjection, never raw money.
 */
import { effectivePrice, formatPrice, type Priceable } from "@/lib/pricing";
import { primaryImage, type ImageLike } from "@/lib/product";
import { toProjection } from "@/lib/chapterPage";
import type { ProductCardModel } from "@/components/ui/ProductCard";
import { imageMedia } from "@/lib/presentation";

const GRADIENT = "gradient:grad-chai";

export interface ShopProductInput extends Priceable {
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  is_hero?: boolean | null;
  is_featured?: boolean | null;
  created_at?: string | null;
  collection?: { slug: string; name: string; volume: string | null } | null;
  product_images?: ImageLike[] | null;
}

export type ShopSort = "featured" | "newest" | "price-asc" | "price-desc";

export interface ShopFilterOption {
  key: string; // "all" | collection slug
  label: string; // "All" | "Dessert"
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
  total: number; // total active products (all chapters)
  shown: number; // after the chapter filter
  chapters: ShopFilterOption[];
  sorts: ShopSortOption[];
  activeChapter: string; // "all" | slug
  activeSort: ShopSort;
}

// Short chapter labels for the filter row (mirrors the composer).
const CHAPTER_SHORT: Record<string, { short: string; order: number }> = {
  "dessert-chapter": { short: "Dessert", order: 1 },
  "the-wild-within": { short: "Wild", order: 2 },
  "mood-library": { short: "Mood", order: 3 },
  "nature-chapter": { short: "Nature", order: 4 },
};

const SORT_LABEL: Record<ShopSort, string> = {
  featured: "Featured",
  newest: "Newest",
  "price-asc": "Price · Low to High",
  "price-desc": "Price · High to Low",
};

const isSort = (v: string | undefined): v is ShopSort =>
  v === "featured" || v === "newest" || v === "price-asc" || v === "price-desc";

/** Build a `/shop` query string, overriding one param, dropping defaults. */
function href(chapter: string, sort: ShopSort): string {
  const params = new URLSearchParams();
  if (chapter !== "all") params.set("chapter", chapter);
  if (sort !== "featured") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/shop?${qs}` : "/shop";
}

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
      // Signature (hero) first, then featured, then newest.
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

/** Compose the Shop PLP view from the product rows + the URL params. */
export function buildShopPage(
  products: ShopProductInput[],
  params: { chapter?: string; sort?: string } = {},
): ShopView {
  const activeSort: ShopSort = isSort(params.sort) ? params.sort : "featured";
  const activeChapter = params.chapter ?? "all";

  // Chapter filter options — only chapters that have products, in volume order.
  const counts = new Map<string, { name: string; short: string; order: number; count: number }>();
  for (const p of products) {
    const c = p.collection;
    if (!c) continue;
    const meta = CHAPTER_SHORT[c.slug] ?? { short: c.name, order: 99 };
    const entry = counts.get(c.slug) ?? { name: c.name, short: meta.short, order: meta.order, count: 0 };
    entry.count += 1;
    counts.set(c.slug, entry);
  }
  const chapterList = [...counts.entries()].sort((a, b) => a[1].order - b[1].order);

  const chapters: ShopFilterOption[] = [
    { key: "all", label: "All", href: href("all", activeSort), active: activeChapter === "all", count: products.length },
    ...chapterList.map(([slug, meta]) => ({
      key: slug,
      label: meta.short,
      href: href(slug, activeSort),
      active: activeChapter === slug,
      count: meta.count,
    })),
  ];

  const sorts: ShopSortOption[] = (Object.keys(SORT_LABEL) as ShopSort[]).map((key) => ({
    key,
    label: SORT_LABEL[key],
    href: href(activeChapter, key),
    active: activeSort === key,
  }));

  const filtered =
    activeChapter === "all" ? products : products.filter((p) => p.collection?.slug === activeChapter);
  const cards = sortProducts(filtered, activeSort).map(toCard);

  return {
    cards,
    total: products.length,
    shown: cards.length,
    chapters,
    sorts,
    activeChapter,
    activeSort,
  };
}
