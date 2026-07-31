/**
 * Journal highlights (Phase 7 · point 28) — a small curated list of journal pieces the homepage can
 * feature via the "Featured content" picker. The Journal is a composed page (not a post collection), so
 * there is no per-post DB entity yet; this config is the editable source until a Journal CMS lands.
 */
export interface JournalHighlight { id: string; title: string; excerpt: string; image: string; href: string }

export const JOURNAL_HIGHLIGHTS: JournalHighlight[] = [
  { id: "the-ritual-of-lighting", title: "The Ritual of Lighting", excerpt: "Why the first flame of the evening is a small ceremony worth keeping.", image: "gradient:grad-story", href: "/journal" },
  { id: "notes-on-slowness", title: "Notes on Slowness", excerpt: "On hand-pouring, curing, and the patience a good candle asks of its maker.", image: "gradient:grad-smoke", href: "/journal" },
  { id: "a-house-of-scent", title: "A House of Scent", excerpt: "How a single fragrance can hold a season, a memory, an entire home.", image: "gradient:grad-amethyst", href: "/journal" },
];

export function getJournalHighlights(): JournalHighlight[] {
  return JOURNAL_HIGHLIGHTS;
}
