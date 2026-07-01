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
import { getTestimonials } from "@/config/testimonials";
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
export interface EditorialDividerSettings {
  line?: string; // an optional short editorial line between the hairlines
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
export interface TestimonialQuote {
  quote: string;
  attribution?: string;
}
export interface TestimonialsSettings {
  eyebrow: string;
  heading: string;
  quotes: TestimonialQuote[];
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
  note?: string; // a short line of storytelling beneath the value
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
  moments: string[]; // "Mornings · Reading · Gatherings" — ideal moments
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
  note?: string;
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

const MOMENT_KEYWORDS: [RegExp, string][] = [
  [/morning/i, "Mornings"],
  [/evening|dinner|night|dusk/i, "Evenings"],
  [/read/i, "Reading"],
  [/meditat|calm|quiet|wind|slow|unwind/i, "Quiet moments"],
  [/festi|gather|celebrat|guest|welcome/i, "Gatherings"],
  [/gift/i, "Gifting"],
];
function deriveMoments(text: string | null): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const [re, label] of MOMENT_KEYWORDS) {
    if (re.test(text) && !found.includes(label)) found.push(label);
  }
  return found;
}

/** Care · Wax & Wick · Ingredients · Shipping · Sustainability — filled from the
 *  product where structured data exists; otherwise from house policy copy. */
function candleAccordion(view: ProductPageView): AccordionItem[] {
  const wax = view.details.find((d) => d.label === "Wax")?.value;
  const wick = view.details.find((d) => d.label === "Wick")?.value;
  const vessel = view.vessels.length ? view.vessels.join(" · ") : "ceramic or glass";
  return [
    {
      title: "Candle Care & Safety",
      body: "Always burn within sight, and extinguish before leaving the room or sleeping. Trim the wick to ¼ inch before each use for a clean, even burn. Keep at least two feet from anything flammable, and away from drafts, fans, or open windows. Place on a stable, heat-resistant surface. Limit each session to four hours, and stop burning when ½ inch of wax remains. Never move a burning candle.",
    },
    {
      title: "Wax & Wick Details",
      body: `${wax ?? "A creamy coconut wax blend"} for a slow, clean, even burn. ${wick ?? "A lead-free cotton wick"}, trimmed for a steady, low-soot flame. Burn time scales with size — a longer, slower burn in the larger vessels.`,
    },
    {
      title: "Ingredients & Materials",
      body: `Hand-poured with a premium coconut wax blend and a 100% natural, lead-free cotton wick. Premium-grade, phthalate-free fragrance and essential oils, IFRA-compliant. Free from parabens and sulfates, and never tested on animals. Poured into a reusable ${vessel} vessel.`,
    },
    {
      title: "Shipping & Exchanges",
      body: "Carefully packed and dispatched within 1–3 business days (a little longer during festive periods). Free standard shipping within India on orders over ₹5,000; most orders arrive in 3–7 business days. Worldwide shipping via trusted couriers (duties/taxes at checkout). Due to the handcrafted nature of our candles we do not accept returns, but if your order arrives damaged or incorrect, write to us within 48 hours and we will make it right.",
    },
    {
      title: "Sustainability & Reusability",
      body: "Cured for 10–14 days before shipping for a stronger, truer scent throw. Once the last of the wax is gone, the vessel can be cleaned and upcycled — a keepsake for flowers, brushes or small things. Made slowly, meant to last beyond the flame.",
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

  const waxValue = view.details.find((d) => d.label === "Wax")?.value ?? "Natural coconut & soy blend";
  const wickValue = view.details.find((d) => d.label === "Wick")?.value ?? "Lead-free cotton";
  const craftItems: CraftItem[] = [
    { label: "Hand Poured", value: "In small batches", note: "Poured slowly, by hand — never mass-produced." },
    { label: "Wax Blend", value: waxValue, note: "Crafted for a slow, clean, even burn." },
    { label: "Cotton Wick", value: wickValue, note: "Trimmed for a steady, low-soot flame." },
  ];
  if (view.vessels.length) {
    craftItems.push({
      label: "The Vessel",
      value: view.vessels.join(" · "),
      note: "Reusable once the wax is gone — a keepsake, not waste.",
    });
  }

  const lifestyleRows: LifestyleRow[] = splitParagraphs(view.mood.lifestyle).map((line, i) => ({
    label: ["Where it belongs", "When to light it", "Pairs with"][i] ?? "And",
    value: line,
  }));
  const lifestyleMoments = deriveMoments(view.mood.lifestyle);

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
        moments: lifestyleMoments,
        align: "image-left",
      } satisfies LifestyleFeatureSettings,
      { visibility: lifestyleRows.length > 0 || lifestyleMoments.length > 0 },
    ),
    fill(
      "cultural",
      { quote: view.mood.cultural ?? "", variant: "hairline" } satisfies EditorialQuoteSettings,
      { visibility: Boolean(view.mood.cultural) },
    ),
    fill(
      "divider-memory",
      { line: "Every fragrance begins with a memory." } satisfies EditorialDividerSettings,
      { visibility: storyBody.length > 0 || view.notes.length > 0 },
    ),
    fill(
      "testimonials",
      {
        eyebrow: "Letters From Our Community",
        heading: "In their words",
        quotes: getTestimonials(view.chapterSlug).map((t) => ({ quote: t.quote, attribution: t.attribution })),
      } satisfies TestimonialsSettings,
      { visibility: getTestimonials(view.chapterSlug).length > 0 },
    ),
    fill("divider-close", {} satisfies EditorialDividerSettings),
    fill("details", { items: candleAccordion(view) } satisfies EditorialAccordionSettings),
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
      title: "Composition",
      body: "A 100ml room & linen mist. Alcohol-free, skin-safe formula, made with premium fragrance and essential oils. Mist lightly into the air, or over linen and soft furnishings, and let it settle.",
    },
    {
      title: "Shipping & Exchanges",
      body: "Dispatched within 2–3 business days. Complimentary shipping on orders over ₹1,000. Returns accepted within 48 hours of delivery for damaged or incorrect items.",
    },
  ];
}

/** Air scent as an Opening / Heart / Lingering structure (the brand's perfumery
 *  language) from the three notes; extra notes fold into Lingering. */
function airScentLayers(scent: string[]): { label: string; notes: string[] }[] {
  const labels = ["Opening", "Heart", "Lingering"];
  return labels
    .map((label, i) => ({
      label,
      notes: i < 2 ? (scent[i] ? [scent[i]] : []) : scent.slice(2),
    }))
    .filter((l) => l.notes.length > 0);
}

export function buildAirEditorial({ hour, volume, others }: AirEditorialInput): SectionInstance[] {
  const overrides: SectionInstance[] = [
    // The Hour — the signature time, prominent, with why it inspired the scent.
    fill("the-hour", {
      eyebrow: "The Hour",
      heading: hour.time,
      body: [hour.hourReason],
      align: "none",
    } satisfies EditorialStatementSettings, { visibility: Boolean(hour.hourReason) }),
    // Fragrance Journey — Opening / Heart / Lingering (the brand's perfumery
    // language; lighter under the air palette).
    fill("smells-like", {
      eyebrow: "Fragrance Journey",
      heading: "",
      layers: airScentLayers(hour.scent),
    } satisfies FragrancePyramidSettings, { visibility: hour.scent.length > 0 }),
    // Feels Like — large editorial typography, one evocative line per row.
    fill("feels-like", { eyebrow: "Feels Like", lines: hour.feels } satisfies PoeticLinesSettings, {
      visibility: hour.feels.length > 0,
    }),
    // The Experience — the atmosphere of the room, sentence per line.
    fill("experience", {
      eyebrow: "The Experience",
      body: hour.experience.split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter(Boolean),
      align: "none",
    } satisfies EditorialStatementSettings, { visibility: Boolean(hour.experience) }),
    fill("placement", {
      eyebrow: "Placement",
      heading: "Best enjoyed",
      items: hour.placement,
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
