/**
 * Homepage "Brand Story" beat (internal name only — never shown in the UI). An
 * editorial spread that answers *why Samorah exists*, experienced through
 * photography, typography and a few restrained words — not an "About Us" block.
 *
 * Fully CMS-ready: a future campaign can change the heading, copy, photography,
 * mood, background tone, CTA and even the layout orientation with no component
 * rebuild — the same campaign-driven philosophy as the Hero (Decision 15).
 */
export interface BrandStory {
  eyebrow: string;
  heading: string;
  body: string;
  /** Optional single editorial sentence. When set, a campaign shows this in
   *  place of `body` — no structural change to the component. */
  quote?: string;
  /** `gradient:<class>` placeholder → Cloudinary URL later. Photography focuses
   *  on *the making* (hands, terracotta, wax, brushes, materials, studio light),
   *  not the finished product. */
  image: string;
  imageAlt: string;
  /** Seasonal/editorial feeling so campaigns can evolve the photography mood
   *  without a rebuild: warm · autumn · monsoon · winter · festival · morning · evening … */
  photographyMood: string;
  ctaLabel: string;
  ctaHref: string;
  /** Surface tone (maps to a design-system surface): soft-beige · warm-ivory · ivory. */
  backgroundTone: string;
  orientation: "image-left" | "image-right";
}

export const BRAND_STORY: BrandStory = {
  eyebrow: "Created for the spaces between moments",
  heading: "We compose atmosphere by hand.",
  body: "Before it is a fragrance, it is a memory — steam rising from a clay cup, rain on warm earth, a room turning gold at dusk. Each is poured slowly, by hand, so the feeling lingers long after the flame.",
  image: "gradient:grad-story",
  imageAlt:
    "Inside the Samorah studio — wax, terracotta and fragrance materials in natural light.",
  photographyMood: "warm",
  ctaLabel: "Enter the Studio",
  ctaHref: "/about/our-story",
  backgroundTone: "soft-beige",
  orientation: "image-left",
};

export function getBrandStory(): BrandStory {
  return BRAND_STORY;
}
