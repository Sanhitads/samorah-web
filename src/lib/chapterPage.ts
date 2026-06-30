/**
 * Chapter Page builder (Phase 8, step 9) — turns a `collections` row into a
 * platform `Page` composed from EDITORIAL_CHAPTER_TEMPLATE. The route does no
 * layout: fetch → buildChapterPage → PageView. Pure (no I/O); structural input
 * types keep it decoupled from the generated DB Row types.
 *
 * Behaviour that used to be implicit is now CMS-ready CONFIGURATION (hero
 * strategy · supporting rules · empty-state strategy · chapter ordering), with
 * defaults that preserve the original behaviour. Honors the commerce boundary
 * (§14): products cross into editorial only as a `ProductCommerceProjection`.
 */
import type { Page } from "@/platform/page";
import type { SectionInstance } from "@/platform/section";
import type { ProductCommerceProjection } from "@/platform/commerce";
import type { ThemeToken, EditorialMood } from "@/platform/primitives";
import type { SeoMeta } from "@/platform/content";
import type { EditorialVoice } from "@/config/voices";
import { formatPrice, effectivePrice, type Priceable } from "@/lib/pricing";
import { primaryImage, productBadge, type ImageLike } from "@/lib/product";
import { chapterTitle } from "@/lib/collection";
import {
  imageMedia,
  type A11yMeta,
  type CtaAction,
  type HeroLayout,
  type MediaContent,
  type OverlayStyle,
  type ProductCardVariant,
  type RailLayout,
} from "@/lib/presentation";

const GRADIENT = (cls: string) => `gradient:${cls}`;

// ── Structural inputs (any object with these fields — incl. service results) ──

export interface ChapterProductInput extends Priceable {
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  is_hero?: boolean | null;
  is_featured?: boolean | null;
  created_at?: string | null;
  /** "Core Collection" | "Limited Collection" | "Seasonal" | … (defaults to Core). */
  collection_type?: string | null;
  product_images?: ImageLike[] | null;
}

export interface ChapterSummary {
  id: string;
  name: string;
  slug: string;
  volume: string | null;
  tagline?: string | null;
  cover_image_url?: string | null;
  is_coming_soon: boolean;
  created_at?: string | null;
}

/** Optional CMS identity — editorial mood / emotion / type / cover icon. */
export interface ChapterIdentity {
  editorialMood?: EditorialMood;
  primaryEmotion?: string;
  collectionType?: string; // "signature" | "seasonal" | "limited" | …
  icon?: string;
  coverAssetId?: string; // future cover identity (AssetRef)
}

/** A FAQ pair → FAQPage JSON-LD. */
export interface ChapterFaq {
  question: string;
  answer: string;
}

/** Richer editorial SEO the CMS can fill; all optional, computed when absent. */
export interface ChapterSeoInput {
  summary?: string; // editorial summary → meta description / OG
  keywords?: string[];
  canonical?: string;
  faq?: ChapterFaq[];
  readingTime?: number; // minutes; computed from the description if absent
}

export interface ChapterInput extends ChapterSummary {
  poetic_line?: string | null;
  description?: string | null;
  hero_product_id?: string | null;
  products: ChapterProductInput[];
  identity?: ChapterIdentity;
  seo?: ChapterSeoInput;
  // Editorial content references — reserved so the CMS can attach a story /
  // gallery later WITHOUT changing the page model (the sections stay declared).
  storyContentId?: string | null;
  galleryContentId?: string | null;
}

// ── Strategies (configuration; data, not implicit logic) ─────────────────────

export type HeroStrategy =
  | "automatic" // hero_product_id → is_hero → first   (default; original behaviour)
  | "explicit" // only the chapter's hero_product_id
  | "featured" // first is_featured / is_hero
  | "newest" // most recently created
  | "manual"; // a pinned product slug (config.hero.productSlug)

export type SupportingSort =
  | "curated" // input order (default)
  | "alphabetical"
  | "newest"
  | "price-asc"
  | "price-desc";

export interface SupportingRules {
  sort?: SupportingSort;
  limit?: number;
  hideHero?: boolean; // default true
  groupBy?: "none" | "scent_group" | "fragrance_family";
}

/** What a section does when it has no content — declared, not just hidden. */
export type EmptyStrategy = "hide" | "collapse" | "placeholder" | "coming-soon";

export type ChapterOrdering =
  | "manual" // input order (default)
  | "volume" // by volume label (Vol. I, II, …)
  | "release-date" // by created_at
  | "alphabetical"
  | "campaign"; // a campaign-provided order (falls back to manual)

export type ChapterSectionId =
  | "hero"
  | "story"
  | "featured"
  | "supporting"
  | "quote"
  | "gallery"
  | "next-chapter";

export interface ChapterPageConfig {
  hero?: { strategy?: HeroStrategy; productSlug?: string; layout?: HeroLayout };
  supporting?: SupportingRules;
  ordering?: ChapterOrdering;
  empty?: Partial<Record<ChapterSectionId, EmptyStrategy>>;
}

const DEFAULT_EMPTY: Record<ChapterSectionId, EmptyStrategy> = {
  hero: "placeholder",
  story: "hide",
  featured: "hide",
  supporting: "hide",
  quote: "hide",
  gallery: "hide",
  "next-chapter": "hide",
};

// ── Editorial view-models the section components read (the section contract) ──

export interface ChapterProductView {
  slug: string;
  name: string;
  tagline: string | null;
  /** Samorah chapter numbering — "VOL. I.1" — part of the brand identity. */
  edition: string;
  /** "Core Collection" | "Limited Collection" | … */
  collectionType: string;
  /** Editorial price label, e.g. "From ₹899". */
  priceLabel: string;
  media: MediaContent; // image today; video/3d reserved by the contract
  commerce: ProductCommerceProjection;
}

export interface ChapterCardView {
  slug: string;
  volume: string | null; // "Vol. II"
  name: string; // "The Wild Within"
  tagline: string | null;
  image: string;
  comingSoon: boolean;
}

export interface ChapterHeroSettings {
  volume: string | null;
  title: string;
  tagline: string | null;
  poeticLine: string | null;
  /** A subtle "you are here" line, e.g. "The Fragrance Library". */
  breadcrumb: string;
  media: MediaContent;
  overlay: OverlayStyle;
  /** Hero height as data (compact|editorial|immersive|fullscreen) — CMS-driven. */
  layout: HeroLayout;
  readingTime: number;
  identity: ChapterIdentity;
  a11y: A11yMeta;
  emptyStrategy: EmptyStrategy;
}

/** The opening "pause" — VOL · title · a poetic introduction, no product. */
export interface ChapterIntroSettings {
  volume: string | null;
  title: string;
  intro: string | null;
  chapterContext: string;
  a11y: A11yMeta;
}
export interface ChapterFeaturedSettings {
  eyebrow: string;
  /** "VOL. I — The Dessert Chapter" — keeps the reader inside the chapter. */
  chapterContext: string;
  product: ChapterProductView | null;
  /** A longer editorial "inspired by" note for the signature (optional). */
  note: string | null;
  /** True when this is the chapter's only fragrance — the signature expands to
   *  read as a curated single-fragrance chapter, not one "missing products". */
  solo: boolean;
  cta: CtaAction;
  a11y: A11yMeta;
  emptyStrategy: EmptyStrategy;
}
export interface ChapterCollectionSettings {
  heading: string;
  chapterContext: string;
  products: ChapterProductView[];
  groupBy: SupportingRules["groupBy"];
  cardVariant: ProductCardVariant;
  cardCta: CtaAction;
  a11y: A11yMeta;
  emptyStrategy: EmptyStrategy;
}
export interface ChapterQuoteSettings {
  voice: EditorialVoice | null;
  emptyStrategy: EmptyStrategy;
}
export interface ChapterEditorialSettings {
  contentId: string | null; // story / gallery content ref [Future attach]
  emptyStrategy: EmptyStrategy;
}
export interface ChapterRailSettings {
  heading: string;
  chapterContext: string;
  chapters: ChapterCardView[];
  layout: RailLayout;
  a11y: A11yMeta;
  emptyStrategy: EmptyStrategy;
}

// ── Mapping ──────────────────────────────────────────────────────────────────

const CHAPTER_THEME: Record<string, ThemeToken> = {
  "dessert-chapter": "clay",
  "the-wild-within": "forest",
  "mood-library": "dark-library",
  "nature-chapter": "forest",
};

function imageOf(p: ChapterProductInput): { url: string; alt: string } {
  const img = primaryImage(p.product_images);
  return { url: img?.url ?? GRADIENT("grad-chai"), alt: img?.alt_text ?? p.name };
}

export function toProjection(p: ChapterProductInput): ProductCommerceProjection {
  const price = formatPrice(p);
  return {
    productId: p.id,
    slug: p.slug,
    currency: "INR",
    priceRange: { min: effectivePrice(p), max: p.price, display: price.current },
    // Card projections carry no variant stock; treated as available until a
    // later beat enriches with inventory. badge still surfaces sale/hero.
    inStock: true,
    badge:
      productBadge({ is_hero: p.is_hero, is_featured: p.is_featured, price: p.price, sale_price: p.sale_price }) ??
      undefined,
  };
}

/** Samorah chapter numbering — "Vol. I" + position → "VOL. I.1". */
function editionLabel(volume: string | null, n: number): string {
  return volume ? `${volume.toUpperCase()}.${n}` : `No. ${n}`;
}

function toProductView(p: ChapterProductInput, edition: string): ChapterProductView {
  const { url, alt } = imageOf(p);
  return {
    slug: p.slug,
    name: p.name,
    tagline: p.tagline ?? null,
    edition,
    collectionType: p.collection_type ?? "Core Collection",
    priceLabel: `From ${formatPrice(p).current}`,
    media: imageMedia(url, alt, "portrait"),
    commerce: toProjection(p),
  };
}

function toChapterCard(c: ChapterSummary): ChapterCardView {
  return { slug: c.slug, volume: c.volume, name: c.name, tagline: c.tagline ?? null, image: c.cover_image_url ?? GRADIENT("grad-chai"), comingSoon: c.is_coming_soon };
}

function poeticVoice(chapter: ChapterInput): EditorialVoice | null {
  const line = chapter.poetic_line ?? chapter.tagline;
  if (!line) return null;
  return { id: `chapter-${chapter.slug}`, quote: line, author: chapterTitle(chapter), type: "Brand Promise", displayOrder: 1, homepageFeatured: true, isVisible: true };
}

// ── Strategy resolvers ───────────────────────────────────────────────────────

/** Resolve the chapter's hero candle from the configured strategy. */
export function selectHero(
  products: ChapterProductInput[],
  chapter: ChapterInput,
  cfg: ChapterPageConfig["hero"] = {},
): ChapterProductInput | null {
  const byCreated = (a: ChapterProductInput, b: ChapterProductInput) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? "");
  switch (cfg.strategy ?? "automatic") {
    case "explicit":
      return products.find((p) => p.id === chapter.hero_product_id) ?? null;
    case "featured":
      return products.find((p) => p.is_featured) ?? products.find((p) => p.is_hero) ?? null;
    case "newest":
      return [...products].sort(byCreated)[0] ?? null;
    case "manual":
      return products.find((p) => p.slug === cfg.productSlug) ?? null;
    case "automatic":
    default:
      return (
        products.find((p) => p.id === chapter.hero_product_id) ??
        products.find((p) => p.is_hero) ??
        products[0] ??
        null
      );
  }
}

/** Resolve the supporting collection from the configured rules. */
export function selectSupporting(
  products: ChapterProductInput[],
  hero: ChapterProductInput | null,
  rules: SupportingRules = {},
): ChapterProductInput[] {
  const hideHero = rules.hideHero ?? true;
  let list = hideHero && hero ? products.filter((p) => p.slug !== hero.slug) : [...products];

  switch (rules.sort) {
    case "alphabetical":
      list.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "newest":
      list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      break;
    case "price-asc":
      list.sort((a, b) => effectivePrice(a) - effectivePrice(b));
      break;
    case "price-desc":
      list.sort((a, b) => effectivePrice(b) - effectivePrice(a));
      break;
    case "curated":
    default:
      break; // input order
  }
  if (rules.limit != null) list = list.slice(0, rules.limit);
  return list;
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
function volumeOrder(volume: string | null): number {
  if (!volume) return 999;
  const m = volume.match(/([IVX]+)/i);
  return m ? ROMAN[m[1].toUpperCase()] ?? 999 : 999;
}

/** Order the chapter set for navigation + the closing rail. */
export function orderChapters<T extends ChapterSummary>(chapters: T[], strategy: ChapterOrdering = "manual"): T[] {
  const live = chapters.filter((c) => !c.is_coming_soon);
  switch (strategy) {
    case "alphabetical":
      return [...live].sort((a, b) => a.name.localeCompare(b.name));
    case "release-date":
      return [...live].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    case "volume":
      return [...live].sort((a, b) => volumeOrder(a.volume) - volumeOrder(b.volume));
    case "manual":
    case "campaign":
    default:
      return live; // input order (campaign order TBD → manual)
  }
}

// ── SEO ──────────────────────────────────────────────────────────────────────

function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function faqSchema(faq: ChapterFaq[]): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };
}

function buildSeo(chapter: ChapterInput, title: string, description: string): SeoMeta {
  const seo = chapter.seo ?? {};
  return {
    title: `${title} · Samorah`,
    description: seo.summary ?? description,
    keywords: seo.keywords,
    canonical: seo.canonical,
    ogImage: chapter.cover_image_url ?? undefined,
    twitterCard: "summary_large_image",
    structuredData: seo.faq?.length ? faqSchema(seo.faq) : undefined,
  };
}

// ── The builder ──────────────────────────────────────────────────────────────

/** Only the fields a page override changes — omits type/variant/order so
 *  composeSections keeps the template's values. Cast to SectionInstance. */
function fill(id: string, settings: object, extra: Partial<SectionInstance> = {}): SectionInstance {
  return { id, settings: settings as Record<string, unknown>, ...extra } as SectionInstance;
}

/** A section renders when it has content, or when its empty strategy isn't "hide". */
function showsWhenEmpty(hasContent: boolean, strategy: EmptyStrategy): boolean {
  return hasContent || strategy !== "hide";
}

/**
 * Compose a Chapter Page from a collection. `allChapters` drives previous/next
 * navigation and the closing rail (ordered by `config.ordering`). `config`
 * carries the hero / supporting / empty / ordering strategies; every default
 * reproduces the original behaviour.
 */
export function buildChapterPage(
  chapter: ChapterInput,
  allChapters: ChapterSummary[] = [],
  config: ChapterPageConfig = {},
): Page {
  const empty = { ...DEFAULT_EMPTY, ...config.empty };
  const products = chapter.products ?? [];

  const heroProduct = selectHero(products, chapter, config.hero);
  const supporting = selectSupporting(products, heroProduct, config.supporting);

  const ordered = orderChapters(allChapters, config.ordering);
  const idx = ordered.findIndex((c) => c.slug === chapter.slug);
  const prev = idx > 0 ? ordered[idx - 1] : undefined;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : undefined;
  const others = ordered.filter((c) => c.slug !== chapter.slug);

  const title = chapterTitle(chapter);
  const description = chapter.description ?? chapter.tagline ?? `${chapter.name} — a Samorah chapter.`;
  const voice = poeticVoice(chapter);
  // "VOL. I — The Dessert Chapter": the reminder carried through every section.
  const chapterContext = chapter.volume ? `${chapter.volume.toUpperCase()} — ${chapter.name}` : chapter.name;

  const cover = chapter.cover_image_url ?? GRADIENT("grad-chai");
  const heroSettings: ChapterHeroSettings = {
    volume: chapter.volume,
    title: chapter.name,
    tagline: chapter.tagline ?? null,
    poeticLine: chapter.poetic_line ?? null,
    breadcrumb: "The Fragrance Library",
    media: imageMedia(cover, `${chapter.name} atmosphere`, "cinematic"),
    overlay: "gradient",
    layout: config.hero?.layout ?? "immersive",
    readingTime: chapter.seo?.readingTime ?? readingTime(description),
    identity: chapter.identity ?? {},
    a11y: { headingLevel: 1, landmark: "region" },
    emptyStrategy: empty.hero,
  };
  // The opening pause — repurposes the template's order-2 narrative slot ("story")
  // as a product-free chapter introduction (page-level override; template untouched).
  const intro: ChapterIntroSettings = {
    volume: chapter.volume,
    title: chapter.name,
    intro: chapter.poetic_line ?? chapter.tagline ?? null,
    chapterContext,
    a11y: { headingLevel: 2, landmark: "region" },
  };
  // Chapter numbering — hero is .1, supporting continue .2, .3, … (brand identity).
  const featuredProduct = heroProduct ? toProductView(heroProduct, editionLabel(chapter.volume, 1)) : null;
  const supportingViews = supporting.map((p, i) => toProductView(p, editionLabel(chapter.volume, i + 2)));

  const featured: ChapterFeaturedSettings = {
    eyebrow: "The signature of this chapter",
    chapterContext,
    product: featuredProduct,
    note: chapter.description ?? null, // the signature embodies the chapter
    solo: supportingViews.length === 0, // the only fragrance → expand it
    cta: { label: "Discover", href: featuredProduct ? `/shop/${featuredProduct.slug}` : undefined },
    a11y: { headingLevel: 2 },
    emptyStrategy: empty.featured,
  };
  const collection: ChapterCollectionSettings = {
    heading: "The rest of the chapter",
    chapterContext,
    products: supportingViews,
    groupBy: config.supporting?.groupBy ?? "none",
    cardVariant: "editorial",
    cardCta: { label: "Discover" },
    a11y: { headingLevel: 2, landmark: "list" },
    emptyStrategy: empty.supporting,
  };
  const quote: ChapterQuoteSettings = { voice, emptyStrategy: empty.quote };
  const gallery: ChapterEditorialSettings = { contentId: chapter.galleryContentId ?? null, emptyStrategy: empty.gallery };
  const rail: ChapterRailSettings = { heading: "Continue to the next chapter", chapterContext, chapters: others.map(toChapterCard), layout: "editorial", a11y: { headingLevel: 2, landmark: "region" }, emptyStrategy: empty["next-chapter"] };

  // Overrides keyed by the template's section ids (merged over the template).
  // Empty strategy + content presence decide visibility per section.
  const sections: SectionInstance[] = [
    fill("hero", heroSettings, { trackingId: "chapter:hero" }),
    // order-2 "story" slot → the opening introduction (type override, page-level)
    fill("story", intro, { type: "ChapterIntro", visibility: Boolean(intro.intro) }),
    fill("featured", featured, {
      visibility: showsWhenEmpty(Boolean(featured.product), empty.featured),
      trackingId: "chapter:featured",
    }),
    fill("supporting", collection, {
      visibility: showsWhenEmpty(collection.products.length > 0, empty.supporting),
      trackingId: "chapter:supporting",
    }),
    fill("quote", quote, { visibility: showsWhenEmpty(Boolean(voice), empty.quote) }),
    fill("gallery", gallery, { visibility: showsWhenEmpty(Boolean(gallery.contentId), empty.gallery) }),
    fill("next-chapter", rail, {
      visibility: showsWhenEmpty(others.length > 0, empty["next-chapter"]),
      trackingId: "chapter:next",
    }),
  ];

  return {
    id: `chapter-${chapter.slug}`,
    experienceId: "candle-chapters",
    slug: chapter.slug,
    template: "editorial-chapter",
    status: "published",
    visibility: !chapter.is_coming_soon,
    palette: CHAPTER_THEME[chapter.slug] ?? "warm-ivory",
    editorialMood: chapter.identity?.editorialMood,
    navigation: {
      previous: prev ? `chapter-${prev.slug}` : undefined,
      next: next ? `chapter-${next.slug}` : undefined,
      chapter: chapter.slug,
    },
    seo: buildSeo(chapter, title, description),
    breadcrumb: [
      { label: "Home", href: "/" },
      { label: title, href: `/chapters/${chapter.slug}` },
    ],
    // Chapter analytics — declared on the Page Engine's events seam (impl later).
    // chapter-viewed → "viewed"; featured/discover clicks → "cta"; reaching the
    // closing rail → "completed". Per-section trackingIds scope the interactions.
    events: { emits: ["viewed", "cta", "completed"], scrollDepths: [25, 50, 75, 100], trackingId: `chapter:${chapter.slug}` },
    manifest: {
      displayName: title,
      previewAsset: chapter.identity?.coverAssetId ?? chapter.cover_image_url ?? undefined,
      purpose: chapter.identity?.collectionType ?? "chapter",
      owner: "editorial",
    },
    sections,
  };
}
