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
  price?: number | null; // base price — fallback when a product has no variants
  scent_group: string | null;
  fragrance_family: string | null;
  collection_type?: string | null; // "Core Collection" | "Limited Collection" (default Core)
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
  focal?: string; // CSS object-position for the crop (e.g. "50% 30%"); undefined = centre
}

/** The gallery to show for the selected variant: its own photos if it has any, else the shared default. */
export function galleryForVariant(
  selectedVariantId: string | null,
  galleriesByVariant: Record<string, ProductGalleryImage[]>,
  defaultGallery: ProductGalleryImage[],
): ProductGalleryImage[] {
  const own = selectedVariantId ? galleriesByVariant[selectedVariantId] : undefined;
  return own && own.length ? own : defaultGallery;
}
export interface ProductVariantView {
  id: string;
  vessel: string;
  size: string;
  price: number;
  priceLabel: string; // "₹899"
  burnTime: string; // "~45 hours" — varies by size
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
  themeMood?: string | null; // "Loved & Romantic" — the mood within the theme, shown beside the eyebrow
  collectionType: string; // "Core Collection" | "Limited Collection"
  edition: string; // "VOL. III.1" — set by the route from the collection position
  scentGroup: string | null;
  fragranceFamily: string | null;
  gallery: ProductGalleryImage[]; // shared/default gallery (variant_id-null images) — also the SEO/card source
  /** Per-variant galleries keyed by variant id. A variant absent here (no own photos) falls back to `gallery`. */
  galleriesByVariant: Record<string, ProductGalleryImage[]>;
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
/** Burn time scales with size — the panel updates as the size is chosen. */
const BURN_BY_SIZE: Record<string, string> = {
  "100g": "~25 hours",
  "140g": "~32 hours",
  "180g": "~40 hours",
  "200g": "~45 hours",
  "350g": "~80 hours",
};

/** Sort a set of images by sort_order and map to the gallery view type. */
function toGalleryImages(imgs: ImageLike[], name: string): ProductGalleryImage[] {
  return [...imgs.filter((i) => i.url)]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i) => ({ src: i.url, alt: i.alt_text ?? name, focal: i.focal ?? undefined }));
}

/** Shared/default gallery = images with no variant (variant_id null). This is what every pre-existing
 *  product has, so the default view is byte-identical to before. If a product has ONLY per-variant
 *  images (no shared ones), fall back to any image so the default view is never blank, else the gradient
 *  placeholder (the unchanged no-image behaviour). */
function toGallery(p: ProductInput): ProductGalleryImage[] {
  const all = p.product_images ?? [];
  const shared = toGalleryImages(all.filter((i) => i.variant_id == null), p.name);
  if (shared.length) return shared;
  const any = toGalleryImages(all, p.name);
  return any.length ? any : [{ src: GRADIENT, alt: p.name }];
}

/** Per-variant galleries keyed by variant id, from images tagged with a variant_id. A variant with no
 *  own images is simply absent from the map; the gallery then falls back to the shared default. */
function toGalleriesByVariant(p: ProductInput): Record<string, ProductGalleryImage[]> {
  const groups = new Map<string, ImageLike[]>();
  for (const img of p.product_images ?? []) {
    if (!img.url || img.variant_id == null) continue;
    const g = groups.get(img.variant_id) ?? [];
    g.push(img);
    groups.set(img.variant_id, g);
  }
  const out: Record<string, ProductGalleryImage[]> = {};
  for (const [vid, imgs] of groups) {
    const gallery = toGalleryImages(imgs, p.name);
    if (gallery.length) out[vid] = gallery;
  }
  return out;
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
        burnTime: BURN_BY_SIZE[v.size_label ?? ""] ?? "",
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
  // Burn time is shown (and updated by size) in the purchase panel, not here.
  const rows: DetailRow[] = [];
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

  // Variant matrix, with a base-price fallback so a product that has a price but
  // no variants is still buyable (a single "Standard" line) rather than showing
  // an empty price + "Unavailable".
  let variantViews = toVariantViews(variants);
  let vessels = availableVessels(variants);
  let sizes = availableSizes(variants);
  let defaultVariantId = def?.id ?? null;
  let priceLabel = "";
  if (variants.length > 0) {
    const r = priceRange(variants as Priceable[]);
    priceLabel = r.min === r.max ? formatINR(r.min) : `From ${formatINR(r.min)}`;
  } else if (p.price != null) {
    variantViews = [
      { id: p.id, vessel: "", size: "", price: p.price, priceLabel: formatINR(p.price), burnTime: "", inStock: true, stockNote: null },
    ];
    defaultVariantId = p.id;
    vessels = [];
    sizes = [];
    priceLabel = formatINR(p.price);
  }

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    chapterName,
    chapterSlug: p.collection?.slug ?? null,
    chapterHref: p.collection ? `/chapters/${p.collection.slug}` : null,
    collectionType: p.collection_type ?? "Core Collection",
    edition: "", // filled by the route from the collection position
    scentGroup: p.scent_group,
    fragranceFamily: p.fragrance_family,
    gallery: toGallery(p),
    galleriesByVariant: toGalleriesByVariant(p),
    vessels,
    sizes,
    variants: variantViews,
    defaultVariantId,
    priceLabel,
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
