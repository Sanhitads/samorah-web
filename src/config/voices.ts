/**
 * Homepage §6 — the Editorial Voice (internally "Words"; titleless in the UI).
 *
 * NOT a testimonial section — no stars, ratings, avatars or review cards. It is
 * the homepage's closing voice: the final paragraph of a beautifully edited
 * story. One literary sentence, centred in generous whitespace, read like a line
 * from a book rather than marketing copy. Its purpose is reflection, not
 * persuasion — the emotional pause before the Atmosphere Gallery.
 *
 * GLOBAL vs CAMPAIGN: a voice with no `campaignId` is **brand-wide** (the
 * default the homepage falls back to, relevant whatever the campaign's product
 * category — candle, room spray, linen spray …). A voice with a `campaignId` is
 * campaign-specific / seasonal, which marketing can feature during that campaign.
 *
 * GUIDANCE: even campaign-specific voices must stay **universal across every
 * product in that campaign**. Avoid candle-only references (flame, wax, wick)
 * unless the campaign is candle-exclusive — a Seasonal Line should read as
 * truthfully over a room spray or linen spray as over a candle.
 *
 * CURATED & code-free: even with many voices in the CMS the homepage shows
 * exactly ONE. `type` lets the same component carry every kind forever, e.g.:
 *   Brand Promise — "Some fragrances stay in the room. The rare ones stay in memory."
 *   Seasonal Line (Christmas) — "Winter has its own silence."
 *   Seasonal Line (Monsoon)   — "Every rain remembers something."
 *   Customer Voice — "Our home has never felt quieter." — Ananya, Bangalore
 *   Press Quote    — "A fragrance house built like an editorial studio." — Vogue India
 */
export type VoiceType =
  | "Brand Promise"
  | "Customer Voice"
  | "Press Quote"
  | "Seasonal Line";

export interface EditorialVoice {
  id: string;
  /** The single literary sentence — the only focal point. */
  quote: string;
  /** Understated attribution — "Samorah" · "House Note" · "Ananya, Bangalore" ·
   *  a publication. Rendered very small, never competing with the quote. */
  author: string;
  type: VoiceType;
  /** Omitted → a GLOBAL, brand-wide voice (the homepage default). Set → a
   *  campaign-specific / seasonal voice featured during that campaign. */
  campaignId?: string;
  displayOrder: number;
  /** Only a `homepageFeatured` voice can appear; the homepage shows one. */
  homepageFeatured: boolean;
  isVisible: boolean;
}

/**
 * Launch voices. The featured default is a brand-wide Brand Promise so the
 * section stays relevant for any campaign; seasonal lines are tied to future
 * campaigns and wait, un-featured, until marketing activates them.
 */
export const EDITORIAL_VOICES: EditorialVoice[] = [
  {
    id: "promise-memory",
    quote: "Some fragrances stay in the room. The rare ones stay in memory.",
    author: "Samorah",
    type: "Brand Promise",
    displayOrder: 1,
    homepageFeatured: true, // ← the brand-wide default shown today
    isVisible: true,
  },
  {
    id: "promise-evening",
    quote: "The room remembered the evening long after the flame.",
    author: "House Note",
    type: "Brand Promise",
    displayOrder: 2,
    homepageFeatured: false,
    isVisible: true,
  },
  {
    id: "seasonal-winter",
    quote: "Winter has its own silence.",
    author: "Samorah",
    type: "Seasonal Line",
    campaignId: "winter-edition",
    displayOrder: 3,
    homepageFeatured: false, // marketing features this during the winter campaign
    isVisible: true,
  },
  {
    id: "seasonal-monsoon",
    quote: "Every rain remembers something.",
    author: "Samorah",
    type: "Seasonal Line",
    campaignId: "monsoon-edition",
    displayOrder: 4,
    homepageFeatured: false,
    isVisible: true,
  },
];

/**
 * The single curated homepage voice. A campaign-specific voice wins only if
 * marketing has featured one for the active campaign; otherwise the section
 * defaults to a brand-wide (global) voice, so it stays relevant whatever the
 * campaign's product category.
 */
export function getEditorialVoice(campaignId?: string): EditorialVoice | null {
  const pool = EDITORIAL_VOICES.filter(
    (v) => v.isVisible && v.homepageFeatured,
  ).sort((a, b) => a.displayOrder - b.displayOrder);

  if (campaignId) {
    const tied = pool.find((v) => v.campaignId === campaignId);
    if (tied) return tied;
  }
  return pool.find((v) => !v.campaignId) ?? pool[0] ?? null;
}
