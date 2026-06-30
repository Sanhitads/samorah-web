/**
 * Product editorial builder (Phase 9) — composes the reusable Editorial Blocks
 * below the PDP commerce header into a sequence, filling each block's settings
 * from the product. Same builder pattern as `buildChapterPage`; rendered by the
 * existing SectionRenderer. Pure.
 */
import type { SectionInstance } from "@/platform/section";
import { composeSections } from "@/platform/template";
import { CANDLE_PDP_TEMPLATE } from "@/platform/coreTemplates";
import type { ProductPageView } from "@/lib/productPage";
import type { Artist } from "@/config/artist";
import type { ProductCardModel } from "@/components/ui/ProductCard";
import { imageMedia, type MediaContent } from "@/lib/presentation";
import { effectivePrice, formatINR, type Priceable } from "@/lib/pricing";
import { primaryImage, productBadge, type ImageLike } from "@/lib/product";

// ── Editorial block settings (the contracts each block component reads) ──────

export type EditorialAlign = "image-left" | "image-right" | "none";

export interface EditorialStatementSettings {
  eyebrow: string;
  heading?: string;
  body: string[];
  media?: MediaContent;
  align: EditorialAlign;
}
export interface FragrancePyramidSettings {
  eyebrow: string;
  heading: string;
  intro?: string;
  layers: { label: string; notes: string[] }[];
}
export interface EditorialQuoteSettings {
  quote: string;
  attribution?: string;
  variant: "hairline" | "handwritten";
}
export interface ArtistFeatureSettings {
  eyebrow: string;
  name: string;
  role: string;
  story: string[];
  media: MediaContent;
  align: EditorialAlign;
}
export interface ArtworkFeatureSettings {
  media: MediaContent;
  caption?: string;
}
export interface AccordionItem {
  title: string;
  body: string;
}
export interface EditorialAccordionSettings {
  items: AccordionItem[];
}
export interface RelatedProductsSettings {
  eyebrow: string;
  heading: string;
  products: ProductCardModel[];
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface RelatedProductInput extends Priceable {
  slug: string;
  name: string;
  tagline?: string | null;
  is_hero?: boolean | null;
  is_featured?: boolean | null;
  product_images?: ImageLike[] | null;
}

export interface CandleEditorialInput {
  view: ProductPageView;
  artist?: Artist;
  related: RelatedProductInput[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const splitParagraphs = (text: string | null): string[] =>
  text ? text.split(/\n{2,}|\n/).map((t) => t.trim()).filter(Boolean) : [];

const stripVolume = (chapter: string): string => {
  const dash = chapter.split("—");
  return (dash[dash.length - 1] ?? chapter).trim();
};

function toCard(p: RelatedProductInput): ProductCardModel {
  const img = primaryImage(p.product_images);
  const price = effectivePrice(p);
  return {
    slug: p.slug,
    name: p.name,
    tagline: p.tagline ?? null,
    media: imageMedia(img?.url ?? "gradient:grad-chai", img?.alt_text ?? p.name, "portrait"),
    priceLabel: `From ${formatINR(price)}`,
    commerce: {
      priceRange: { min: price, max: p.price, display: formatINR(price) },
      badge: productBadge({ is_hero: p.is_hero, is_featured: p.is_featured, price: p.price, sale_price: p.sale_price }) ?? undefined,
    },
  };
}

function candleAccordion(): AccordionItem[] {
  return [
    {
      title: "Candle Care & Safety",
      body: "Trim the wick to 5mm before each lighting. Never leave a burning candle unattended. Keep away from drafts and flammable materials. Burn no longer than four hours at a time, and discontinue use when 10mm of wax remains.",
    },
    {
      title: "Shipping & Exchanges",
      body: "Dispatched within 2–3 business days. Complimentary shipping on orders over ₹1,000. Returns accepted within 48 hours of delivery for damaged or incorrect items.",
    },
    {
      title: "Ingredients & Materials",
      body: "Premium soy-coconut wax blend. 100% cotton, lead-free wick. Phthalate-free, IFRA-compliant fragrance compounds. Reusable ceramic or glass vessel.",
    },
  ];
}

const fill = (id: string, settings: object, extra: Partial<SectionInstance> = {}): SectionInstance =>
  ({ id, settings: settings as Record<string, unknown>, ...extra }) as SectionInstance;

// ── The builder ──────────────────────────────────────────────────────────────

export function buildCandleEditorial({ view, artist, related }: CandleEditorialInput): SectionInstance[] {
  const storyBody = splitParagraphs(view.mood.story);
  const storyImage = view.gallery[1]?.src ?? view.gallery[0]?.src;

  const overrides: SectionInstance[] = [
    fill(
      "story",
      {
        eyebrow: "The Story Within",
        body: storyBody,
        media: storyImage ? imageMedia(storyImage, view.name, "landscape") : undefined,
        align: "image-left",
      } satisfies EditorialStatementSettings,
      { visibility: storyBody.length > 0 },
    ),
    fill(
      "journey",
      {
        eyebrow: "Fragrance Journey",
        heading: "The composition unfolds",
        intro: "Each layer is built to evolve — opening in brightness, settling into warmth, and lingering as atmosphere.",
        layers: view.notes.map((n) => ({ label: n.label, notes: n.notes })),
      } satisfies FragrancePyramidSettings,
      { visibility: view.notes.length > 0 },
    ),
    fill(
      "artist",
      artist
        ? ({
            eyebrow: "The Artist Behind This Candle",
            name: artist.name,
            role: artist.role,
            story: artist.story,
            media: imageMedia(artist.processImages[0] ?? artist.portrait, artist.name, "landscape"),
            align: "image-right",
          } satisfies ArtistFeatureSettings)
        : {},
      { visibility: Boolean(artist) },
    ),
    fill(
      "artwork",
      artist
        ? ({
            media: imageMedia(artist.artworkImages[0] ?? artist.portrait, `Artwork by ${artist.name}`, "cinematic"),
            caption: artist.signature,
          } satisfies ArtworkFeatureSettings)
        : {},
      { visibility: Boolean(artist?.artworkImages.length) },
    ),
    fill(
      "artist-quote",
      artist
        ? ({ quote: artist.quote, attribution: artist.signature, variant: "handwritten" } satisfies EditorialQuoteSettings)
        : {},
      { visibility: Boolean(artist?.quote) },
    ),
    fill("details", { items: candleAccordion() } satisfies EditorialAccordionSettings),
    fill(
      "related",
      {
        eyebrow: "Continue",
        heading: view.chapterName ? `Continue the ${stripVolume(view.chapterName)}` : "More to discover",
        products: related.map(toCard),
      } satisfies RelatedProductsSettings,
      { visibility: related.length > 0 },
    ),
  ];

  return composeSections(CANDLE_PDP_TEMPLATE.sections, overrides);
}
