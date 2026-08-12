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
import { airEditionOf, AIR_SECTION_POSITIONS, type AirVolume, type HourEntry, type CustomSection } from "@/config/theHours";
import { getArtist, type Artist } from "@/config/artist";
import { getTestimonials } from "@/config/testimonials";
import type { ProductCardModel } from "@/components/ui/ProductCard";
import { imageMedia, type MediaContent } from "@/lib/presentation";
import { freeShippingLabel, shippingPolicySentence, SHIPPING } from "@/config/commerce";
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
  intervalMs?: number; // crossfade interval (default 5500)
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
  edition?: string | null; // "NO. I.2" — the shared chapter numbering, shown on the card
  collectionType?: string | null; // "Core Collection" — the card's meta line
}

/** Apply pdp_content overrides that belong to the hero/commerce view (not the editorial section
 *  stack): the edition label, the collection-type meta line, and per-size burn times. Mutates and
 *  returns the view. Shared by the route and the live preview so both show the same hero. */
export function applyCandleViewOverrides(p: ProductPageView, content?: CandlePdpContent): ProductPageView {
  if (!content) return p;
  if (content.edition) p.edition = content.edition;
  if (content.collectionType) p.collectionType = content.collectionType;
  if (content.burnTimes) p.variants = p.variants.map((v) => ({ ...v, burnTime: content.burnTimes?.[v.size] || v.burnTime }));
  return p;
}

/**
 * Per-product artist for the candle PDP — when a product enables a custom artist, the PDP + preview
 * use it; otherwise the house artist. Shared by the route and the live-preview surface so both build
 * the identical Artist Feature / Artwork / Quote blocks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildProductArtist(pa: any): Artist | undefined {
  return pa?.artist_enabled
    ? {
        id: "product",
        name: pa.artist_name || "The Samorah Artist",
        role: pa.artist_role || "Painter · Colourist",
        story: String(pa.artist_story || "").split(/\n{2,}|\n/).map((t: string) => t.trim()).filter(Boolean),
        portrait: pa.artist_image || "gradient:grad-blush",
        processImages: [pa.artist_image || "gradient:grad-chai"],
        artworkImages: ["gradient:grad-amethyst"],
        signature: `— ${pa.artist_name || "The Samorah Artist"}`,
        quote: pa.artist_quote || "",
      }
    : getArtist(null);
}

/**
 * Candle-PDP CMS extras (stored in products.pdp_content). All optional — every field falls back to
 * the house default, so a candle with no pdp_content renders exactly as before. Threaded into
 * buildCandleEditorial so headings, the memory line, the accordion, custom sections and section
 * images become per-product editable without new columns.
 */
export interface CandlePdpContent {
  palette?: string; // a preset theme token override (else the chapter default); customPalette wins over this
  customPalette?: { surface?: string; ink?: string; accent?: string }; // accent recolours the edition numbering (--accent)
  customGradient?: { from: string; to: string; angle: number };
  labels?: {
    storyEyebrow?: string;
    journeyEyebrow?: string; journeyHeading?: string; journeyIntro?: string;
    moodEyebrow?: string; moodHeading?: string;
    craftEyebrow?: string; craftHeading?: string;
    artistEyebrow?: string;
    lifestyleEyebrow?: string; lifestyleHeading?: string;
    testimonialsEyebrow?: string; testimonialsHeading?: string;
    memoryLine?: string;
    continueEyebrow?: string;
  };
  accordion?: { title: string; body: string }[];
  customSections?: CustomSection[];
  storyImage?: string; lifestyleImage?: string; artworkImage?: string;
  testimonials?: { quote: string; attribution: string }[];
  testimonialInterval?: number; // crossfade seconds between voices (default 5.5)
  collectionType?: string; // hero meta — "Core Collection" | "Limited Collection" | "Seasonal Collection" | "Archive"
  edition?: string; // hero edition override — "NO. I.1" (else the shared chapter numbering)
  burnTimes?: Record<string, string>; // size label -> burn time, e.g. { "100g": "~25 hours" }
  lifestyleMoments?: string[]; // the tag row under Living With It (else derived from the text)
  craft?: CraftItem[]; // "Made by hand" tiles — Hand Poured / Wax / Wick / Vessel (else the house set)
  // Batch C — product-type specifications (wax tablet / reed diffuser / other): a labelled grid the
  // admin fills from type-appropriate defaults. Renders as a "Specifications" grid on the PDP.
  specs?: { label: string; value: string }[];
  specsEyebrow?: string; specsHeading?: string;
}

export interface CandleEditorialInput {
  view: ProductPageView;
  artist?: Artist;
  related: RelatedProductInput[];
  content?: CandlePdpContent;
  /** Admin-configured free-shipping threshold (₹) for the house "Shipping & Exchanges"
   *  copy; defaults to the code constant so callers/tests stay unaffected. */
  freeShippingThresholdInr?: number;
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
    edition: p.edition ?? undefined,
    collectionType: p.collectionType ?? "Core Collection",
    cta: { label: "Discover", href: `/shop/${p.slug}` },
    media: imageMedia(img?.url ?? "gradient:grad-chai", img?.alt_text ?? p.name, "portrait"),
    priceLabel: `From ${formatINR(price)}`,
    commerce: {
      priceRange: { min: price, max: p.price, display: formatINR(price) },
      badge: productBadge({ is_hero: p.is_hero, is_featured: p.is_featured, is_bestseller: (p as { is_bestseller?: boolean | null }).is_bestseller, price: p.price, sale_price: p.sale_price }) ?? undefined,
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
function candleAccordion(view: ProductPageView, freeThresholdInr: number = SHIPPING.freeThreshold): AccordionItem[] {
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
      body: `Carefully packed and dispatched within 1–3 business days (a little longer during festive periods). Complimentary standard shipping within India on orders over ${freeShippingLabel(freeThresholdInr)}; most orders arrive in 3–7 business days. Worldwide shipping via trusted couriers (duties/taxes at checkout). Due to the handcrafted nature of our candles we do not accept returns, but if your order arrives damaged or incorrect, write to us within 48 hours and we will make it right.`,
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

export function buildCandleEditorial({ view, artist, related, content, freeShippingThresholdInr }: CandleEditorialInput): SectionInstance[] {
  const L = content?.labels ?? {};
  const storyBody = splitParagraphs(view.mood.story);
  const galleryImage = view.gallery[1]?.src ?? view.gallery[0]?.src;
  const storyImage = content?.storyImage || galleryImage; // Story Within — own image, else product image #2
  const lifestyleImage = content?.lifestyleImage || galleryImage; // Living With It — own image, else the same
  const testimonialQuotes = content?.testimonials?.length
    ? content.testimonials.filter((t) => t.quote?.trim()).map((t) => ({ quote: t.quote, attribution: t.attribution }))
    : getTestimonials(view.chapterSlug).map((t) => ({ quote: t.quote, attribution: t.attribution }));

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
        eyebrow: L.storyEyebrow || "The Story Within",
        body: storyBody,
        media: storyImage ? imageMedia(storyImage, view.name, "landscape") : undefined,
        align: "image-left",
      } satisfies EditorialStatementSettings,
      { visibility: storyBody.length > 0 },
    ),
    fill(
      "journey",
      {
        eyebrow: L.journeyEyebrow || "Fragrance Journey",
        heading: L.journeyHeading || "The composition unfolds",
        intro: L.journeyIntro || "Each layer is built to evolve — opening in brightness, settling into warmth, and lingering as atmosphere.",
        layers: view.notes.map((n) => ({ label: n.label, notes: n.notes })),
      } satisfies FragrancePyramidSettings,
      { visibility: view.notes.length > 0 },
    ),
    fill(
      "artist",
      artist
        ? ({
            eyebrow: L.artistEyebrow || "The Artist Behind This Candle",
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
            media: imageMedia(content?.artworkImage || artist.artworkImages[0] || artist.portrait, `Artwork by ${artist.name}`, "cinematic"),
            caption: artist.signature,
          } satisfies ArtworkFeatureSettings)
        : {},
      { visibility: Boolean(content?.artworkImage || artist?.artworkImages.length) },
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
      { eyebrow: L.moodEyebrow || "Scent Mood", heading: L.moodHeading || "The feeling it leaves", cards: moodCards } satisfies MoodGridSettings,
      { visibility: moodCards.length > 0 },
    ),
    fill(
      "craft",
      {
        eyebrow: L.craftEyebrow || "Craft & Composition",
        heading: L.craftHeading || "Made by hand",
        items: content?.craft?.length ? content.craft.filter((c) => c.label?.trim() || c.value?.trim()) : craftItems,
      } satisfies CraftDetailsSettings,
      { visibility: (content?.craft?.length ? content.craft : craftItems).filter((c) => c.label?.trim() || c.value?.trim()).length > 1 },
    ),
    fill(
      "lifestyle",
      {
        eyebrow: L.lifestyleEyebrow || "Lifestyle",
        heading: L.lifestyleHeading || "Living with it",
        media: lifestyleImage ? imageMedia(lifestyleImage, view.name, "landscape") : undefined,
        rows: lifestyleRows,
        moments: content?.lifestyleMoments?.length ? content.lifestyleMoments : lifestyleMoments,
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
      { line: L.memoryLine || "Every fragrance begins with a memory." } satisfies EditorialDividerSettings,
      { visibility: storyBody.length > 0 || view.notes.length > 0 },
    ),
    fill(
      "testimonials",
      {
        eyebrow: L.testimonialsEyebrow || "Letters From Our Community",
        heading: L.testimonialsHeading || "In their words",
        quotes: testimonialQuotes,
        intervalMs: content?.testimonialInterval ? Math.max(2, content.testimonialInterval) * 1000 : undefined,
      } satisfies TestimonialsSettings,
      { visibility: testimonialQuotes.length > 0 },
    ),
    fill("divider-close", {} satisfies EditorialDividerSettings),
    fill(
      "details",
      { items: content?.accordion?.length ? content.accordion.filter((r) => r.title?.trim() || r.body?.trim()) : candleAccordion(view, freeShippingThresholdInr) } satisfies EditorialAccordionSettings,
    ),
    fill(
      "related",
      {
        eyebrow: L.continueEyebrow || "Continue",
        heading: view.chapterName ? `Continue the ${stripVolume(view.chapterName)}` : "More to discover",
        products: related.map(toCard),
      } satisfies RelatedProductsSettings,
      { visibility: related.length > 0 },
    ),
  ];

  // Batch C — product-type specifications grid (wax tablet / reed diffuser / other). Reuses the grid
  // block (PlacementGrid) so there's no new styling and it can't break the page; lands after Craft.
  const specItems = (content?.specs ?? []).filter((s) => s.label?.trim() || s.value?.trim()).map((s) => ({ label: s.label, note: s.value }));
  if (specItems.length) {
    const specSection = buildCustomSection(
      { type: "grid", position: "after-craft", eyebrow: content?.specsEyebrow || "Specifications", heading: content?.specsHeading || "The details", items: specItems },
      0, CANDLE_POS_ORDER, 5.5, "candle-specs",
    );
    if (specSection) overrides.push(specSection);
  }

  return composeSections(CANDLE_PDP_TEMPLATE.sections, applyCandleCustomSections(overrides, content?.customSections));
}

/**
 * Insert admin-added custom sections at their chosen positions. Mirrors the air PDP: each
 * CustomSection maps to a core editorial block (statement / lines / grid / quote) with a fractional
 * order so it lands before/after the fixed sections. No custom sections → overrides unchanged.
 */
function applyCandleCustomSections(overrides: SectionInstance[], custom?: CustomSection[]): SectionInstance[] {
  if (!custom?.length) return overrides;
  const extra = custom
    .map((s, i) => buildCustomSection(s, i, CANDLE_POS_ORDER, 14.5, "candle-custom"))
    .filter((s): s is SectionInstance => s !== null);
  return [...overrides, ...extra];
}

// ── Air PDP (Experience B; data from config/theHours until air products exist) ──

export interface AirEditorialInput {
  hour: HourEntry;
  volume: AirVolume;
  others: HourEntry[];
  /** Admin-configured free-shipping threshold (₹) for the house Shipping copy; defaults to the constant. */
  freeShippingThresholdInr?: number;
}

function toHourCard(h: HourEntry, volume: AirVolume): ProductCardModel {
  return {
    slug: h.productSlug,
    name: h.name,
    tagline: h.feels[0] ?? h.scent.join(" · "),
    edition: airEditionOf(volume, h.productSlug), // "VOL. I.3"
    media: imageMedia(h.gradient, h.name, "portrait"),
    priceLabel: h.priceLabel,
    commerce: { priceRange: { min: h.price, max: h.price, display: h.priceLabel } },
  };
}

function airAccordion(composition?: string, freeThresholdInr: number = SHIPPING.freeThreshold): AccordionItem[] {
  return [
    {
      title: "Composition",
      body:
        composition ??
        "A 100ml room & linen mist. Alcohol-free, skin-safe formula, made with premium fragrance and essential oils. Mist lightly into the air, or over linen and soft furnishings, and let it settle.",
    },
    {
      title: "Shipping & Exchanges",
      body: `Dispatched within 2–3 business days. ${shippingPolicySentence(freeThresholdInr)} Returns accepted within 48 hours of delivery for damaged or incorrect items.`,
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

const POS_ORDER: Record<string, number> = Object.fromEntries(AIR_SECTION_POSITIONS.map((p) => [p.value, p.order]));

/** Candle PDP — where an admin-added custom section can be dropped, and the fractional order that
 *  places it in the gap between the fixed sections (story 1 … related 14). Used by both the builder
 *  and the editor's position dropdown. */
export const CANDLE_SECTION_POSITIONS: { value: string; label: string; order: number }[] = [
  { value: "top", label: "Top — before The Story", order: 0.5 },
  { value: "after-story", label: "After The Story Within", order: 1.5 },
  { value: "after-journey", label: "After Fragrance Journey", order: 2.5 },
  { value: "after-mood", label: "After Scent Mood", order: 4.5 },
  { value: "after-craft", label: "After Craft & Composition", order: 5.5 },
  { value: "after-artist", label: "After The Artist", order: 8.5 },
  { value: "after-lifestyle", label: "After Living With It", order: 9.5 },
  { value: "after-testimonials", label: "After In Their Words", order: 11.5 },
  { value: "end", label: "End — after Continue the Chapter", order: 14.5 },
];
const CANDLE_POS_ORDER: Record<string, number> = Object.fromEntries(CANDLE_SECTION_POSITIONS.map((p) => [p.value, p.order]));

/** Map one admin CustomSection to a SectionInstance built from an EXISTING block type, so it inherits
 *  the design system's CSS + themed shell (no new styling, can't break the page). `posOrder` places
 *  it into a gap between the built-in sections; `fallbackOrder` is used for an unknown position; ties
 *  keep list order. Returns null for an empty section. Shared by the air + candle PDPs. */
export function buildCustomSection(c: CustomSection, i: number, posOrder: Record<string, number>, fallbackOrder: number, idPrefix = "custom"): SectionInstance | null {
  const order = (posOrder[c.position ?? ""] ?? fallbackOrder) + i * 0.001;
  const base = { id: `${idPrefix}-${i}`, order, visibility: true, spacing: "lg", animation: "fade" };
  if (c.type === "lines") {
    const lines = (c.lines ?? []).map((l) => l.trim()).filter(Boolean);
    return lines.length ? ({ ...base, type: "PoeticLines", variant: "verse", settings: { eyebrow: c.eyebrow ?? "", lines } } as unknown as SectionInstance) : null;
  }
  if (c.type === "grid") {
    const items = (c.items ?? []).map((x) => ({ label: (x.label ?? "").trim(), note: (x.note ?? "").trim() })).filter((x) => x.label || x.note);
    return items.length ? ({ ...base, type: "PlacementGrid", variant: "grid", settings: { eyebrow: c.eyebrow ?? "", heading: c.heading ?? "", items } } as unknown as SectionInstance) : null;
  }
  if (c.type === "quote") {
    const quote = (c.body ?? "").trim();
    return quote ? ({ ...base, type: "EditorialQuote", variant: "handwritten", settings: { quote, variant: "handwritten" } } as unknown as SectionInstance) : null;
  }
  const body = (c.body ?? "").split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
  return body.length ? ({ ...base, type: "EditorialStatement", variant: "statement", settings: { eyebrow: c.eyebrow ?? "", heading: c.heading ?? "", body, align: "none" } } as unknown as SectionInstance) : null;
}

/** Compose admin-defined custom sections for the air PDP (see buildCustomSection). */
function buildAirCustomSections(list: CustomSection[]): SectionInstance[] {
  return list.map((c, i) => buildCustomSection(c, i, POS_ORDER, 6.5)).filter((s): s is SectionInstance => s !== null);
}

export function buildAirEditorial({ hour, volume, others, freeShippingThresholdInr }: AirEditorialInput): SectionInstance[] {
  // Every heading/eyebrow can be overridden per product (labels); a blank falls back to the house
  // default, so nothing on the air PDP is truly hard-coded — it is all editable in the admin.
  const L = hour.labels ?? {};
  // The Hour — the short reason leads, the long story follows. Both render when both are filled
  // (the reason is no longer hidden behind the story), so every field the admin types is visible.
  const hourBody = [hour.hourReason, ...(hour.hourStory ? hour.hourStory.split(/\n{2,}/) : [])]
    .map((t) => t.trim())
    .filter(Boolean);
  // Details accordion — admin-defined rows when present (rename / reorder / add / remove),
  // otherwise the house defaults (Composition + Shipping).
  const accordionItems = hour.accordion?.length ? hour.accordion : airAccordion(hour.productDetails, freeShippingThresholdInr);
  const overrides: SectionInstance[] = [
    // The Hour — the signature time, prominent, with the reason + story beneath it.
    fill("the-hour", {
      eyebrow: L.hourEyebrow || "The Hour",
      heading: hour.time,
      body: hourBody,
      align: "none",
    } satisfies EditorialStatementSettings, { visibility: hourBody.length > 0 }),
    // Fragrance Journey — Opening / Heart / Lingering (the brand's perfumery
    // language; lighter under the air palette). "The Effect" as the lead line.
    fill("smells-like", {
      eyebrow: L.fragranceEyebrow || "Fragrance Journey",
      heading: "",
      intro: hour.scentEffect,
      layers: airScentLayers(hour.scent),
    } satisfies FragrancePyramidSettings, { visibility: hour.scent.length > 0 }),
    // Feels Like — large editorial typography, one evocative line per row.
    fill("feels-like", { eyebrow: L.feelsEyebrow || "Feels Like", lines: hour.feels } satisfies PoeticLinesSettings, {
      visibility: hour.feels.length > 0,
    }),
    // The Experience — the atmosphere of the room, sentence per line.
    fill("experience", {
      eyebrow: L.experienceEyebrow || "The Experience",
      body: hour.experience.split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter(Boolean),
      align: "none",
    } satisfies EditorialStatementSettings, { visibility: Boolean(hour.experience) }),
    fill("placement", {
      eyebrow: L.placementEyebrow || "Placement",
      heading: L.placementHeading || "Where it belongs",
      items: hour.placement,
    } satisfies PlacementGridSettings, { visibility: hour.placement.length > 0 }),
    fill("signature", { quote: hour.signature, variant: "handwritten" } satisfies EditorialQuoteSettings, {
      visibility: Boolean(hour.signature),
    }),
    fill("details", { items: accordionItems } satisfies EditorialAccordionSettings, { visibility: accordionItems.length > 0 }),
    fill("related", {
      eyebrow: L.continueEyebrow || "Continue",
      heading: L.continueHeading || `Continue ${volume.title}`,
      products: others.map((h) => toHourCard(h, volume)),
    } satisfies RelatedProductsSettings, { visibility: others.length > 0 }),
    ...buildAirCustomSections(hour.customSections ?? []),
  ];

  return composeSections(AIR_PDP_TEMPLATE.sections, overrides);
}
