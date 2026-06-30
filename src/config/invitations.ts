/**
 * Homepage §5 — "Living with fragrance" (the section is titleless in the UI).
 *
 * This section does NOT introduce more products. It answers one emotional
 * question — *"How else can fragrance become part of your life?"* — through two
 * editorial worlds that read as **two pages of one spread**, not two promos:
 *
 *     The Air Chapters  (the everyday)   ·   The Ritual Collection  (the gift)
 *
 * Photography is the hero; copy is only the caption (a title, one poetic line,
 * one understated CTA). Silence is part of the luxury. The two images are meant
 * to read as **one story told across two frames** (wide/detail, morning/evening,
 * everyday/ritual) — a relationship, not two independent placeholders.
 *
 * PRODUCT-AGNOSTIC & UNLIMITED. `experienceType` is opaque display/metadata —
 * the component never branches on it — so future worlds (Wardrobe Fragrance,
 * Car Fragrance, Paper Fragrance, Limited Editions …) are introduced as DATA,
 * never by rebuilding the component.
 *
 * CURATED. The homepage shows only `homepageFeatured` invitations (normally two,
 * at most three). Marketing chooses which appear through the CMS — the section
 * never tries to display the full catalogue. Luxury is editing, not showing all.
 *
 * Campaign-driven (the same philosophy as the Hero and Featured Atmosphere): a
 * seasonal campaign can swap titles, copy, photography, tone and CTA via data.
 */

export interface HomeInvitation {
  id: string;

  // — editorial copy (kept extremely restrained: title · one line · CTA) —
  /** The emotional/editorial anchor — fully data-driven so the language can
   *  evolve ("The Air Chapters" → anything) without touching the component. */
  title: string;
  /** The single poetic sentence — the only body copy. */
  line: string;
  /** CMS "Story" — longer editorial copy for a future expanded view. Not
   *  rendered in the restrained homepage caption. */
  story?: string;

  // — what it is (opaque · product-agnostic · unlimited) —
  /** CMS "Experience Type": Air Chapters · Ritual · Wardrobe Fragrance ·
   *  Car Fragrance · Paper Fragrance · Limited Edition … The component NEVER
   *  branches on this; it exists for the CMS/catalogue. */
  experienceType: string;
  /** CMS "Editorial Mood" — daylight · domestic · intimate … (guidance/tint). */
  editorialMood: string;
  /** CMS "Photography Style" — shoot guidance (atmosphere-led, product secondary
   *  or absent); not rendered, it directs the photography that lands later. */
  photographyStyle: string;
  /** CMS "Season" — optional seasonal tag. */
  season?: string;

  // — photography & the "air" (photography is the hero) —
  /** `gradient:<class>` placeholder → Cloudinary URL later (image-led section). */
  image: string;
  /** CMS "Video" — optional near-still ambient footage. */
  video?: string;
  imageAlt: string;
  /** Editorial crop, data-driven (e.g. "4 / 5" · "3 / 4" · "1 / 1" · "3 / 2") so
   *  different invitation types can use different crops while the overall
   *  composition holds. Defaults to 4 / 5. */
  imageRatio?: string;
  /** CMS "Background Tone" — the section surface (warm-ivory · ivory · soft-beige). */
  backgroundTone: string;

  // — action (one understated CTA) —
  ctaLabel: string;
  ctaHref: string;

  // — composition + CMS control —
  /** CMS "Campaign" — campaign-aware ordering. */
  campaignId?: string;
  /** Drives the asymmetric spread: the `primary` world is the larger ~65% story;
   *  every `secondary` stacks in the quieter ~35% column beside it. */
  emphasis?: "primary" | "secondary";
  /** CMS "Homepage Featured" — only these appear on the homepage (curated). */
  homepageFeatured: boolean;
  /** CMS "Display Order". */
  displayOrder: number;
  /** CMS "Visibility". */
  isVisible: boolean;
}

/**
 * Local invitations (the CMS will own this list). Seeded with two worlds — the
 * everyday and the gift — that read as one spread. The catalogue may grow
 * without limit; the homepage curation (`homepageFeatured`) keeps it to two.
 */
export const HOME_INVITATIONS: HomeInvitation[] = [
  {
    id: "air-chapters",
    title: "The Air Chapters",
    line: "Fragrance for the unnoticed hours.",
    experienceType: "Air Chapters",
    editorialMood: "daylight · quiet · domestic",
    photographyStyle:
      "Atmosphere over product — linen moving in daylight, an open window, morning light, books, quiet interiors, soft mist. The product is secondary or absent. One frame of a single story shared with The Ritual (everyday ↔ ritual, morning ↔ evening).",
    image: "gradient:grad-air",
    imageAlt: "Linen stirring in soft morning light beside an open window.",
    imageRatio: "4 / 5",
    backgroundTone: "warm-ivory",
    ctaLabel: "Explore Air Chapters",
    ctaHref: "/collections/the-everyday",
    emphasis: "primary",
    homepageFeatured: true,
    displayOrder: 1,
    isVisible: true,
  },
  {
    id: "the-ritual",
    title: "The Ritual",
    line: "Three fragrances. One story.",
    experienceType: "Ritual",
    editorialMood: "warm · tactile · intimate",
    photographyStyle:
      "Hands arranging objects — candles, ceramic trays, tea, texture, wrapping, gifting, quiet rituals. Never three products lined up. The companion frame to The Air Chapters — one story told across two images.",
    image: "gradient:grad-bundle",
    imageAlt: "Hands arranging candles and ceramics on a tray, wrapped for giving.",
    imageRatio: "4 / 5",
    backgroundTone: "warm-ivory",
    ctaLabel: "Create Your Ritual",
    ctaHref: "/bundles",
    emphasis: "secondary",
    homepageFeatured: true,
    displayOrder: 2,
    isVisible: true,
  },
];

/**
 * Curated homepage invitations — visible & `homepageFeatured` only, in display
 * order (campaign-aware: a campaign's invitations lead). Never returns the full
 * catalogue; marketing curates via the CMS. The component derives the primary
 * (the larger world) and stacks the rest as secondaries.
 */
export function getHomeInvitations(campaignId?: string): HomeInvitation[] {
  const curated = HOME_INVITATIONS.filter(
    (i) => i.isVisible && i.homepageFeatured,
  );
  return curated.sort((a, b) => {
    if (campaignId) {
      const am = a.campaignId === campaignId ? 0 : 1;
      const bm = b.campaignId === campaignId ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    return a.displayOrder - b.displayOrder;
  });
}
