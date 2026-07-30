/**
 * Homepage §4 — "The Atmosphere" (the signature section).
 *
 * "Today's Atmosphere" is the permanent heading of the section (see
 * `ATMOSPHERE_HEADING`) and never changes; only the experience beneath it does.
 * The visitor inhabits ONE fragrance at a time, presented like an exhibition.
 * The narrative spine *is* the layout:
 *
 *     SETTING → MEMORY → ATMOSPHERE → (signature) → FRAGRANCE JOURNEY → product
 *
 * Emotion before composition: where you are, what you remember and the
 * Atmosphere Index all precede the scent's progression.
 *
 * PRODUCT-AGNOSTIC BY DESIGN. The component renders only from atmosphere data
 * and a generic CTA. `productType` is opaque display text (a small editorial
 * label) — the component prints it but NEVER branches on it, so a candle, room
 * spray, linen spray or ritual bundle are presented identically. The CTA leads
 * to the fragrance's own product page; the chapter is explored from there.
 *
 * Fully CMS-ready & campaign-aware (same philosophy as the Hero, Decision 15):
 * a new fragrance or seasonal campaign changes data only — never the component.
 */

/** The permanent section heading — constant across all experiences. Timeless
 *  (deliberately not "Today's …") so it still reads correctly months after
 *  launch. One constant: swap to "Featured Experience" / "Experience" freely. */
export const ATMOSPHERE_HEADING = "Featured Atmosphere";

/** The emotional scent progression — never "Top / Heart / Base". */
export interface ScentProgression {
  /** What you notice first. */
  opening: string;
  /** What slowly unfolds. */
  unfolding: string;
  /** What quietly remains. */
  lingering: string;
}

export interface FeaturedExperience {
  id: string;

  // — identity —
  /** Fragrance name — always the primary title (visitors remember fragrances). */
  title: string;
  /** CMS "Display Name" — optional label for the right-side selector (defaults
   *  to `title`), so marketing can relabel the selector without touching code. */
  displayName?: string;
  /** Editorial product-medium label shown beneath the title — "Scented Candle",
   *  "Room Spray", "Linen Spray", "Ritual Bundle"… Opaque display text; the
   *  component prints it but NEVER branches on it (stays product-agnostic). */
  productType: string;
  /** Chapter the fragrance belongs to — secondary metadata only, not the title. */
  chapter: string;
  /** Optional chapter route (the chapter is explored from the product page). */
  chapterSlug?: string;

  // — the emotional spine —
  /** SCENE — where you are. "A quiet afternoon." */
  scene: string;
  /** MEMORY — the remembered sensation. "Steam rising from warm clay." */
  memory: string;
  /** ATMOSPHERE — the curated descriptors (the Atmosphere Index). PROVISIONAL
   *  Phase 7 solution: decorative leader-line lengths are auto-generated in the
   *  component (never stored). The whole "Atmosphere Language" is to be revisited
   *  once the full site is built and real photography is integrated. */
  atmosphereIndex: string[];
  /** The one unforgettable sentence — the crescendo, set *after* the Index. */
  signatureLine: string;
  /** FRAGRANCE JOURNEY — the emotional progression (First / Then / Finally). */
  scent: ScentProgression;

  // — CTA → the fragrance's product page (product-agnostic destination) —
  /** Natural label, e.g. "Experience Kashmiri Chai". */
  ctaLabel: string;
  /** The product detail page for this fragrance. */
  ctaHref: string;

  // — photography & the "air" (each experience owns all of these) —
  /** `gradient:<class>` placeholder → Cloudinary URL later. Atmosphere-led. */
  image: string;
  /** Optional near-still ambient footage (muted, looped) → later. */
  video?: string;
  imageAlt: string;
  /** Overlay colour ("the air"): maps to a tone in globals.css. */
  backgroundTone: string;
  /** Overlay opacity, 0–1 — weight of the tonal overlay over the photography. */
  overlayStrength: number;
  /** Typography colour: "on-dark" → warm-ivory ink, "on-light" → charcoal ink.
   *  Default "on-dark". */
  colorScheme?: "on-dark" | "on-light";
  /** Optional override colour for the Atmosphere-Index leader lines (CMS-editable). When unset the
   *  scheme-aware default is used (readable on both dark and light fields). */
  lineColor?: string;

  // — CMS control (marketing reorders experiences without touching code) —
  /** CMS "Homepage Featured" — only these appear on the homepage. */
  homepageFeatured: boolean;
  /** Campaign relationship (campaign-aware ordering). */
  campaignId?: string;
  /** CMS "Campaign Priority" — order within an active campaign (lower = leads). */
  campaignPriority?: number;
  /** CMS "Sort Order" — default order outside an active campaign. */
  displayOrder: number;
  /** CMS "Visibility". */
  isVisible: boolean;
}

/**
 * Local atmospheres (the CMS will own this list). Seeded with three fragrances
 * so the "breathe-together" crossfade is real on day one — the architecture
 * handles one, three or five identically. Note the three different
 * `productType`s: the same component presents a candle, a room spray and a
 * linen spray without ever branching on format.
 */
export const FEATURED_EXPERIENCES: FeaturedExperience[] = [
  {
    id: "kashmiri-chai",
    title: "Kashmiri Chai",
    productType: "Scented Candle",
    chapter: "The Dessert Chapter",
    chapterSlug: "dessert-chapter",
    scene: "A quiet afternoon.",
    memory: "Steam rising from warm clay.",
    atmosphereIndex: ["Warm", "Slow", "Quiet", "Golden Hour", "Indoor", "Tea Steam"],
    signatureLine: "An afternoon that refuses to end.",
    scent: {
      opening: "A rush of cardamom steam and crushed black pepper.",
      unfolding: "Spiced milk and saffron, rose folded into strong tea.",
      lingering: "Clay, sandalwood, the sweetness left in an empty cup.",
    },
    ctaLabel: "Discover Kashmiri Chai",
    ctaHref: "/shop/kashmiri-chai",
    image: "gradient:grad-chai",
    imageAlt: "Cardamom steam rising from a clay cup in warm afternoon light.",
    backgroundTone: "ember",
    overlayStrength: 0.62,
    colorScheme: "on-dark",
    homepageFeatured: true,
    campaignId: "kashmiri-chai-launch",
    campaignPriority: 1,
    displayOrder: 1,
    isVisible: true,
  },
  {
    id: "petrichor",
    title: "Petrichor",
    productType: "Room Spray",
    chapter: "The Wild Within",
    chapterSlug: "the-wild-within",
    scene: "A clearing after the rain.",
    memory: "Wet bark and cold green air.",
    atmosphereIndex: ["After Rain", "Forest", "Cool", "Stone", "Earth", "Alive"],
    signatureLine: "The forest keeps breathing after the rain stops.",
    scent: {
      opening: "Crushed fern and rain on warm stone.",
      unfolding: "Cedar, vetiver and the dark green of deep wood.",
      lingering: "Moss, wet earth, smoke drifting somewhere far off.",
    },
    ctaLabel: "Experience Petrichor",
    ctaHref: "/shop/petrichor",
    image: "gradient:grad-wild",
    imageAlt: "Rain settling over moss and dark wood in a forest clearing.",
    backgroundTone: "forest",
    overlayStrength: 0.6,
    colorScheme: "on-dark",
    homepageFeatured: true,
    campaignId: "kashmiri-chai-launch",
    campaignPriority: 2,
    displayOrder: 2,
    isVisible: true,
  },
  {
    id: "velvet-hour",
    title: "Velvet Hour",
    productType: "Linen Spray",
    chapter: "The Mood Library",
    chapterSlug: "mood-library",
    scene: "A room at dusk.",
    memory: "The last light leaving slowly.",
    atmosphereIndex: ["Twilight", "Quiet", "Velvet", "Indoor", "Reflective", "Late"],
    signatureLine: "Twilight, and the room finally exhales.",
    scent: {
      opening: "Cool iris and a breath of cold violet.",
      unfolding: "Amber and incense settling into soft shadow.",
      lingering: "Musk, paper and the hush of a closed book.",
    },
    ctaLabel: "Experience Velvet Hour",
    ctaHref: "/shop/velvet-hour",
    image: "gradient:grad-amethyst",
    imageAlt: "Violet dusk light fading across a quiet interior.",
    backgroundTone: "twilight",
    overlayStrength: 0.64,
    colorScheme: "on-dark",
    homepageFeatured: true,
    campaignId: "kashmiri-chai-launch",
    campaignPriority: 3,
    displayOrder: 3,
    isVisible: true,
  },
];

/**
 * Homepage atmospheres — visible & `homepageFeatured`, in display order.
 * Campaign-aware: pass the active campaign id to surface its fragrances first
 * (stable sort preserves displayOrder within each group). Handles 1 / 3 / 5
 * identically; the component shows no selector for a single atmosphere.
 */
export function getFeaturedExperiences(campaignId?: string): FeaturedExperience[] {
  const visible = FEATURED_EXPERIENCES.filter(
    (e) => e.isVisible && e.homepageFeatured,
  );
  // Default order = Sort Order (displayOrder). When a campaign is active, its
  // experiences lead, ordered by Campaign Priority — all CMS-driven, so
  // marketing can reorder experiences without touching code.
  return visible.sort((a, b) => {
    if (campaignId) {
      const am = a.campaignId === campaignId ? 0 : 1;
      const bm = b.campaignId === campaignId ? 0 : 1;
      if (am !== bm) return am - bm;
      if (am === 0) {
        const ap = a.campaignPriority ?? Number.MAX_SAFE_INTEGER;
        const bp = b.campaignPriority ?? Number.MAX_SAFE_INTEGER;
        if (ap !== bp) return ap - bp;
      }
    }
    return a.displayOrder - b.displayOrder;
  });
}
