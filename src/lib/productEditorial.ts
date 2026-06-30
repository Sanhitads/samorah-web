/**
 * Product editorial builder (Phase 9) — composes the reusable Editorial Blocks
 * below the PDP commerce header into a sequence, filling each block's settings
 * from the product. Same builder pattern as `buildChapterPage`; rendered by the
 * existing SectionRenderer. Pure.
 */
import type { SectionInstance } from "@/platform/section";
import { composeSections } from "@/platform/template";
import { CANDLE_PDP_TEMPLATE, AIR_PDP_TEMPLATE } from "@/platform/coreTemplates";
import type { ProductPageView } from "@/lib/productPage";
import type { AirVolume, HourEntry } from "@/config/theHours";
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
export interface MoodCard {
  label: string;
  value: string;
}
export interface MoodGridSettings {
  eyebrow: string;
  heading?: string;
  cards: MoodCard[];
}
export interface CraftItem {
  label: string;
  value: string;
}
export interface CraftDetailsSettings {
  eyebrow: string;
  heading?: string;
  items: CraftItem[];
}
export interface LifestyleRow {
  label: string;
  value: string;
}
export interface LifestyleFeatureSettings {
  eyebrow: string;
  heading?: string;
  media?: MediaContent;
  rows: LifestyleRow[];
  align: EditorialAlign;
}
export interface NotesColumnSettings {
  eyebrow: string;
  heading?: string;
  notes: string[];
}
export interface PoeticLinesSettings {
  eyebrow: string;
  lines: string[];
}
export interface PlacementItem {
  label: string;
}
export interface PlacementGridSettings {
  eyebrow: string;
  heading?: string;
  items: PlacementItem[];
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

  const moodCards: MoodCard[] = [];
  if (view.mood.tags.length) moodCards.push({ label: "Mood", value: view.mood.tags.join(" · ") });
  if (view.mood.persona) moodCards.push({ label: "Flame Persona", value: view.mood.persona });
  if (view.scentGroup) moodCards.push({ label: "Scent Group", value: view.scentGroup });
  if (view.chapterName) moodCards.push({ label: "Theme", value: stripVolume(view.chapterName) });

  const craftItems: CraftItem[] = [{ label: "Hand Poured", value: "In small batches" }, ...view.details];
  if (view.vessels.length) craftItems.push({ label: "Vessel", value: `${view.vessels.join(" · ")} — reusable` });

  const lifestyleRows: LifestyleRow[] = splitParagraphs(view.mood.lifestyle).map((line, i) => ({
    label: ["Where it belongs", "When to light it", "Pairs with"][i] ?? "Note",
    value: line,
  }));

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
    fill(
      "mood",
      { eyebrow: "Scent Mood", heading: "The feeling it leaves", cards: moodCards } satisfies MoodGridSettings,
      { visibility: moodCards.length > 0 },
    ),
    fill(
      "craft",
      { eyebrow: "Craft & Composition", heading: "Made by hand", items: craftItems } satisfies CraftDetailsSettings,
      { visibility: craftItems.length > 1 },
    ),
    fill(
      "lifestyle",
      {
        eyebrow: "Lifestyle",
        heading: "Living with it",
        media: storyImage ? imageMedia(storyImage, view.name, "landscape") : undefined,
        rows: lifestyleRows,
        align: "image-left",
      } satisfies LifestyleFeatureSettings,
      { visibility: lifestyleRows.length > 0 },
    ),
    fill(
      "cultural",
      { quote: view.mood.cultural ?? "", variant: "hairline" } satisfies EditorialQuoteSettings,
      { visibility: Boolean(view.mood.cultural) },
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

// ── Air PDP (Experience B; data from config/theHours until air products exist) ──

export interface AirEditorialInput {
  hour: HourEntry;
  volume: AirVolume;
  others: HourEntry[];
}

function toHourCard(h: HourEntry): ProductCardModel {
  return {
    slug: h.productSlug,
    name: h.name,
    tagline: h.feels[0] ?? h.scent.join(" · "),
    media: imageMedia(h.gradient, h.name, "portrait"),
    priceLabel: h.priceLabel,
    commerce: { priceRange: { min: h.price, max: h.price, display: h.priceLabel } },
  };
}

function airAccordion(): AccordionItem[] {
  return [
    {
      title: "Product Details",
      body: "A 100ml room & linen mist. Alcohol-free, skin-safe formula. Mist lightly into the air, or over linen and soft furnishings, and let it settle.",
    },
    {
      title: "Shipping & Exchanges",
      body: "Dispatched within 2–3 business days. Complimentary shipping on orders over ₹1,000. Returns accepted within 48 hours of delivery for damaged or incorrect items.",
    },
  ];
}

export function buildAirEditorial({ hour, volume, others }: AirEditorialInput): SectionInstance[] {
  const overrides: SectionInstance[] = [
    fill("the-hour", {
      eyebrow: `Hour ${hour.time}`,
      heading: hour.name,
      body: [hour.story],
      media: imageMedia(hour.gradient, hour.name, "landscape"),
      align: "image-left",
    } satisfies EditorialStatementSettings),
    fill("smells-like", { eyebrow: "Smells Like", heading: "The notes", notes: hour.scent } satisfies NotesColumnSettings, {
      visibility: hour.scent.length > 0,
    }),
    fill("feels-like", { eyebrow: "Feels Like", lines: hour.feels } satisfies PoeticLinesSettings, {
      visibility: hour.feels.length > 0,
    }),
    fill("experience", { eyebrow: "The Experience", body: [hour.experience], align: "none" } satisfies EditorialStatementSettings, {
      visibility: Boolean(hour.experience),
    }),
    fill("placement", {
      eyebrow: "Placement",
      heading: "Where it belongs",
      items: hour.placement.map((label) => ({ label })),
    } satisfies PlacementGridSettings, { visibility: hour.placement.length > 0 }),
    fill("signature", { quote: hour.signature, variant: "handwritten" } satisfies EditorialQuoteSettings, {
      visibility: Boolean(hour.signature),
    }),
    fill("details", { items: airAccordion() } satisfies EditorialAccordionSettings),
    fill("related", {
      eyebrow: "Continue",
      heading: `Continue ${volume.title}`,
      products: others.map(toHourCard),
    } satisfies RelatedProductsSettings, { visibility: others.length > 0 }),
  ];

  return composeSections(AIR_PDP_TEMPLATE.sections, overrides);
}
