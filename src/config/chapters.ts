/**
 * Homepage Signature Chapters — editorial "book covers", not product categories
 * (see the Section 2 principles). Each Chapter is a narrative world; the layout
 * is fixed and only the editorial atmosphere changes.
 *
 * CMS-ready: the section reads from these typed objects, so a future Homepage
 * Chapters manager replaces this source with no component change. Imagery uses
 * `gradient:<class>` placeholders until SPD photography → Cloudinary.
 */
export interface HomeChapter {
  id: string;
  slug: string; // → /chapters/[slug]
  /** Subtitle label, e.g. "Volume I". */
  volume: string;
  title: string;
  /** The quiet editorial line shown on the cover. */
  tagline: string;
  /** Colour/atmosphere mood (data; not all printed). */
  mood: string;
  /** Longer editorial copy (for the chapter page later). */
  description: string;
  /** `gradient:<class>` placeholder → Cloudinary URL later. */
  image: string;
  ctaLabel: string;
  displayOrder: number;
  isVisible: boolean;
  isComingSoon: boolean;
}

export const HOME_CHAPTERS: HomeChapter[] = [
  {
    id: "vol-1",
    slug: "dessert-chapter",
    volume: "Volume I",
    title: "Dessert Chapter",
    tagline: "Where memory tastes like warmth.",
    mood: "Warm amber · Memory · Comfort",
    description:
      "A collection born from the warmth of Indian kitchens — slow, intentional, and deeply comforting.",
    image: "gradient:grad-chai",
    ctaLabel: "Discover",
    displayOrder: 1,
    isVisible: true,
    isComingSoon: false,
  },
  {
    id: "vol-2",
    slug: "the-wild-within",
    volume: "Volume II",
    title: "The Wild Within",
    tagline: "What lives beneath the surface.",
    mood: "Forest greens · Wild · Adventure",
    description:
      "For the untamed — bold botanicals, raw earth, and the electricity of things that grow without asking permission.",
    image: "gradient:grad-wild",
    ctaLabel: "Discover",
    displayOrder: 2,
    isVisible: true,
    isComingSoon: false,
  },
  {
    id: "vol-3",
    slug: "mood-library",
    volume: "Volume III",
    title: "Mood Library",
    tagline: "A fragrance for every state of mind.",
    mood: "Blue-grey · Reflection · Night",
    description:
      "Curated moods for every hour — from the electric clarity of morning to the velvet quiet of midnight.",
    image: "gradient:grad-amethyst",
    ctaLabel: "Discover",
    displayOrder: 3,
    isVisible: true,
    isComingSoon: false,
  },
  {
    id: "vol-4",
    slug: "nature-chapter",
    volume: "Volume IV",
    title: "Nature Chapter",
    tagline: "The outside, brought in.",
    mood: "Earth · Organic · Rain",
    description:
      "A love letter to the natural world — petrichor, forest floors, and the quiet dignity of things that grow slowly.",
    image: "gradient:grad-nature",
    ctaLabel: "Discover",
    displayOrder: 4,
    isVisible: true,
    isComingSoon: false,
  },
];

/** Visible chapters in display order (future CMS owns visibility + ordering). */
export function getVisibleChapters(): HomeChapter[] {
  return HOME_CHAPTERS.filter((c) => c.isVisible).sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
}
