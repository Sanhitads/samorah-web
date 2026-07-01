/**
 * Testimonials — curated, editorial customer voices ("From Our Homes"). No star
 * ratings, no counts, no avatars, no "verified buyer" — quotes only, per the
 * luxury aesthetic (Decision 25). A testimonial may be brand-wide or scoped to a
 * chapter. This is a curated set the studio edits — not user-generated reviews.
 */
export interface Testimonial {
  id: string;
  quote: string;
  attribution?: string; // a first name / city, optional — never a rating
  chapterSlug?: string; // scope to a chapter; brand-wide when absent
}

export const TESTIMONIALS: Testimonial[] = [
  { id: "winter-mornings", quote: "It reminds me of winter mornings with my grandmother." },
  { id: "reading-corner", quote: "It made my reading corner feel complete." },
  { id: "felt-like-art", quote: "The first candle I bought that felt like art." },
];

/** Curated voices for a product — chapter-scoped first, then brand-wide. */
export function getTestimonials(chapterSlug?: string | null, limit = 3): Testimonial[] {
  const scoped = TESTIMONIALS.filter((t) => !t.chapterSlug || t.chapterSlug === chapterSlug);
  return scoped.slice(0, limit);
}
