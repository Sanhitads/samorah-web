/**
 * Core templates (§17) — the default section sequences per experience.
 *
 * Template A — Editorial Chapter (v1), and Limited Edition Chapter which
 * *extends* it (overriding the hero & gallery only). Idempotent registration;
 * framework-agnostic. Section *types* are rendered by the Section Registry; a
 * chapter PAGE fills each section's settings from its data.
 */
import type { Template } from "./template";
import { registerTemplate } from "./template";

export const EDITORIAL_CHAPTER_TEMPLATE: Template = {
  id: "editorial-chapter",
  version: 1,
  experienceKind: "candle-chapters",
  label: "Editorial Chapter",
  description:
    "Hero → Opening Story → Featured Fragrance → Supporting Fragrances → Quote → Gallery → Next Chapter.",
  category: "editorial",
  capabilities: { products: true, chapters: true, campaigns: true, seo: true },
  intent: {
    audience: "Considered gift & self-purchase",
    seoIntent: "Collection / chapter discovery",
    editorialGoal: "Immerse before inviting",
    commerceEmphasis: "soft",
  },
  rules: {
    // Story + Gallery are optional until real editorial-story content exists;
    // a chapter proves the template with Hero → Featured → Collection → Quote → Rail.
    requiredSlots: ["opening", "product", "closing"],
    requiredTypes: ["Hero", "FeaturedProduct"],
    optionalTypes: ["Story", "ProductCollection", "Quote", "Gallery"],
    maxOccurrences: { Hero: 1, Gallery: 2 },
  },
  sections: [
    { id: "hero", type: "Hero", variant: "cinematic", slot: "opening", order: 1, visibility: true, spacing: "xl", animation: "fade", settings: {} },
    { id: "story", type: "Story", variant: "centered", slot: "narrative", order: 2, visibility: true, spacing: "lg", animation: "rise", settings: {} },
    { id: "featured", type: "FeaturedProduct", variant: "spotlight", slot: "product", order: 3, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "supporting", type: "ProductCollection", variant: "paired", slot: "product", order: 4, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "quote", type: "Quote", variant: "hairline", slot: "narrative", order: 5, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "gallery", type: "Gallery", variant: "spread", slot: "atmosphere", order: 6, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "next-chapter", type: "ChapterRail", variant: "rail", slot: "closing", order: 7, visibility: true, spacing: "lg", animation: "fade", settings: {} },
  ],
};

/** Inherits Editorial Chapter; overrides only the hero & gallery. */
export const LIMITED_EDITION_CHAPTER_TEMPLATE: Template = {
  id: "limited-edition-chapter",
  version: 1,
  extends: { id: "editorial-chapter", version: 1 },
  experienceKind: "candle-chapters",
  label: "Limited Edition Chapter",
  description: "Editorial Chapter with a heightened hero and a richer gallery.",
  category: "campaign",
  intent: { editorialGoal: "Anticipation", commerceEmphasis: "soft" },
  sections: [
    { id: "hero", type: "Hero", variant: "immersive", slot: "opening", order: 1, visibility: true, spacing: "xl", animation: "fade", settings: {} },
    { id: "gallery", type: "Gallery", variant: "campaign", slot: "atmosphere", order: 6, visibility: true, spacing: "lg", animation: "fade", settings: {} },
  ],
};

/** Template B — Air Chapters / "The Hours". Hero → Shared Hours (Room) →
 *  Divider → Private Hours (Linen) → Future Volume teaser. Same engines as the
 *  Editorial Chapter; reuses Hero + Divider, adds HoursGroup + FutureVolume. */
export const AIR_HOURS_TEMPLATE: Template = {
  id: "air-hours",
  version: 1,
  experienceKind: "air-chapters",
  label: "The Hours",
  description: "Hero → Shared Hours (Room) → Private Hours (Linen) → Future Volume.",
  category: "editorial",
  capabilities: { products: true, campaigns: true, seo: true },
  intent: {
    audience: "Everyday ritual & gifting",
    seoIntent: "Air / room & linen spray discovery",
    editorialGoal: "A diary of the day's unnoticed moments",
    commerceEmphasis: "soft",
  },
  rules: {
    requiredSlots: ["opening", "closing"],
    requiredTypes: ["Hero"],
    optionalTypes: ["HoursGroup", "Divider", "FutureVolume"],
    maxOccurrences: { Hero: 1, FutureVolume: 1 },
  },
  sections: [
    { id: "hero", type: "Hero", variant: "cinematic", slot: "opening", order: 1, visibility: true, spacing: "xl", animation: "fade", settings: {} },
    { id: "hours-room", type: "HoursGroup", variant: "room", slot: "narrative", order: 2, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "hours-divider", type: "Divider", variant: "labelled", slot: "narrative", order: 3, visibility: true, spacing: "md", animation: "fade", settings: {} },
    { id: "hours-linen", type: "HoursGroup", variant: "linen", slot: "narrative", order: 4, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "future-volume", type: "FutureVolume", variant: "teaser", slot: "closing", order: 5, visibility: true, spacing: "lg", animation: "fade", settings: {} },
  ],
};

/** Candle PDP editorial sequence (Phase 9) — the reusable Editorial Blocks
 *  below the commerce header, composed as a fragrance journal. Same engine as
 *  the chapters; the builder fills each block's settings from the product. */
export const CANDLE_PDP_TEMPLATE: Template = {
  id: "candle-pdp",
  version: 1,
  label: "Candle — Editorial PDP",
  description: "Story → Journey → Artist → Artwork → Quote → Details → Continue.",
  category: "commerce",
  capabilities: { products: true, blocks: true },
  intent: { editorialGoal: "A candle as an editorial book", commerceEmphasis: "soft" },
  sections: [
    { id: "story", type: "EditorialStatement", variant: "statement", slot: "narrative", order: 1, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "journey", type: "FragrancePyramid", variant: "pyramid", slot: "narrative", order: 2, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "artist", type: "ArtistFeature", variant: "feature", slot: "narrative", order: 3, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "artwork", type: "ArtworkFeature", variant: "full", slot: "atmosphere", order: 4, visibility: true, spacing: "md", animation: "fade", settings: {} },
    { id: "artist-quote", type: "EditorialQuote", variant: "handwritten", slot: "narrative", order: 5, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "details", type: "EditorialAccordion", variant: "list", slot: "narrative", order: 6, visibility: true, spacing: "lg", animation: "fade", settings: {} },
    { id: "related", type: "RelatedProducts", variant: "rail", slot: "closing", order: 7, visibility: true, spacing: "lg", animation: "fade", settings: {} },
  ],
};

let registered = false;

export function registerCoreTemplates(): void {
  if (registered) return;
  registered = true;
  registerTemplate(EDITORIAL_CHAPTER_TEMPLATE);
  registerTemplate(LIMITED_EDITION_CHAPTER_TEMPLATE);
  registerTemplate(AIR_HOURS_TEMPLATE);
  registerTemplate(CANDLE_PDP_TEMPLATE);
}
