/**
 * Product Page builder (Phase 9) — turns a `getProductBySlug` row (product +
 * collection + variants + images + fragrance notes) into a typed, serializable
 * view-model the PDP renders. Pure; uses the product + pricing domain helpers.
 * This is the commerce page, so it reads real variants / prices / stock (the
 * editorial pages read only the projection). Principle: Commerce is its own
 * domain, thoughtfully integrated.
 */
import { availableSizes, availableVessels, defaultVariant, primaryImage, stockStatus, type ImageLike, type VariantLike } from "@/lib/product";
import { effectivePrice, formatINR, formatPrice, priceRange, type Priceable } from "@/lib/pricing";

// ── Structural inputs (any object with these fields — incl. the service result) ──

export interface ProductVariantInput extends VariantLike, Priceable {
  sku: string;
  variant_name: string | null;
}

export interface ProductInput {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  scent_group: string | null;
  fragrance_family: string | null;
  story: string | null;
  story_long: string | null;
  flame_persona: string | null;
  cultural_reference: string | null;
  lifestyle_use: string | null;
  mood_tags: string[] | null;
  burn_time: string | null;
  wax_blend: string | null;
  wick: string | null;
  collection?: { name: string; slug: string; volume: string | null } | null;
  variants?: ProductVariantInput[] | null;
  product_images?: ImageLike[] | null;
  fragrance_notes?: { layer: string; note: string; sort_order: number | null }[] | null;
}

// ── View-models the PDP components read ──────────────────────────────────────

export interface ProductGalleryImage {
  src: string;
  alt: string;
}
export interface ProductVariantView {
  id: string;
  vessel: string;
  size: string;
  price: number;
  priceLabel: string; // "₹899"
  inStock: boolean;
  stockNote: string | null; // "Low stock" | null
}
export interface NoteColumn {
  label: string; // "Top Notes"
  notes: string[];
}
export interface DetailRow {
  label: string;
  value: string;
}
export interface ProductMood {
  persona: string | null;
  tags: string[];
  cultural: string | null;
  lifestyle: string | null;
  story: string | null;
}
export interface BreadcrumbLink {
  label: string;
  href: string;
}

export interface ProductPageView {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  chapterName: string | null;
  chapterSlug: string | null;
  chapterHref: string | null;
  scentGroup: string | null;
  fragranceFamily: string | null;
  gallery: ProductGalleryImage[];
  vessels: string[];
  sizes: string[];
  variants: ProductVariantView[];
  defaultVariantId: string | null;
  priceLabel: string; // "From ₹580" / "₹899"
  details: DetailRow[];
  notes: NoteColumn[];
  mood: ProductMood;
  breadcrumb: BreadcrumbLink[];
}

const GRADIENT = "gradient:grad-chai";
const NOTE_LAYERS: { key: string; label: string }[] = [
  { key: "top", label: "Top Notes" },
  { key: "heart", label: "Heart Notes" },
  { key: "base", label: "Base Notes" },
];

function toGallery(p: ProductInput): ProductGalleryImage[] {
  const imgs = (p.product_images ?? []).filter((i) => i.url);
  if (imgs.length === 0) return [{ src: GRADIENT, alt: p.name }];
  return [...imgs]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i) => ({ src: i.url, alt: i.alt_text ?? p.name }));
}

function toVariantViews(variants: ProductVariantInput[]): ProductVariantView[] {
  return variants
    .filter((v) => v.is_active && v.vessel_type && v.size_label)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((v) => {
      const status = stockStatus(v);
      return {
        id: v.id,
        vessel: v.vessel_type as string,
        size: v.size_label as string,
        price: effectivePrice(v),
        priceLabel: formatPrice(v).current,
        inStock: status !== "out_of_stock",
        stockNote: status === "low_stock" ? "Low stock" : status === "out_of_stock" ? "Sold out" : null,
      };
    });
}

function toNotes(p: ProductInput): NoteColumn[] {
  const rows = p.fragrance_notes ?? [];
  return NOTE_LAYERS.map(({ key, label }) => ({
    label,
    notes: rows
      .filter((n) => n.layer.toLowerCase() === key)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((n) => n.note),
  })).filter((c) => c.notes.length > 0);
}

function toDetails(p: ProductInput): DetailRow[] {
  const rows: DetailRow[] = [];
  if (p.burn_time) rows.push({ label: "Burn Time", value: p.burn_time });
  if (p.wax_blend) rows.push({ label: "Wax", value: p.wax_blend });
  if (p.wick) rows.push({ label: "Wick", value: p.wick });
  return rows;
}

export function buildProductPage(p: ProductInput): ProductPageView {
  const variants = (p.variants ?? []) as ProductVariantInput[];
  const def = defaultVariant(variants);
  const chapterName = p.collection
    ? p.collection.volume
      ? `${p.collection.volume} — ${p.collection.name}`
      : p.collection.name
    : null;

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    chapterName,
    chapterSlug: p.collection?.slug ?? null,
    chapterHref: p.collection ? `/chapters/${p.collection.slug}` : null,
    scentGroup: p.scent_group,
    fragranceFamily: p.fragrance_family,
    gallery: toGallery(p),
    vessels: availableVessels(variants),
    sizes: availableSizes(variants),
    variants: toVariantViews(variants),
    defaultVariantId: def?.id ?? null,
    priceLabel:
      variants.length > 0
        ? (() => {
            const r = priceRange(variants as Priceable[]);
            return r.min === r.max ? formatINR(r.min) : `From ${formatINR(r.min)}`;
          })()
        : "",
    details: toDetails(p),
    notes: toNotes(p),
    mood: {
      persona: p.flame_persona,
      tags: p.mood_tags ?? [],
      cultural: p.cultural_reference,
      lifestyle: p.lifestyle_use,
      story: p.story_long ?? p.story,
    },
    breadcrumb: [
      { label: "Home", href: "/" },
      ...(p.collection
        ? [{ label: chapterName ?? p.collection.name, href: `/chapters/${p.collection.slug}` }]
        : []),
      { label: p.name, href: `/shop/${p.slug}` },
    ],
  };
}
