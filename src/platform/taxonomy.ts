/**
 * Global Taxonomy (§10) — one vocabulary everything references.
 *
 * Responsibility: the single controlled vocabulary (mood · season · material …)
 * that products, pages, sections, assets and stories tag against — so search,
 * filtering and personalization stay consistent. Principle: Taxonomy over Free Text.
 */
import type { EditorialMood } from "./primitives";

export type TaxonomyType =
  | "mood"
  | "season"
  | "collection"
  | "experience"
  | "occasion"
  | "material"
  | "color"
  | "ingredient"
  | "space"
  | "emotion";

export interface TaxonomyTerm {
  id: string;
  type: TaxonomyType;
  slug: string;
  label: string;
  parentId?: string;
}

/** A reference to a `TaxonomyTerm` by id. */
export type TaxonomyRef = string;

/**
 * Editorial Mood is CONTENT, not styling — it lives here, not in the theme
 * system. Any mood can pair with any theme (Quiet → Warm Ivory · Forest ·
 * Winter …; Celebration → Warm Ivory · Clay · Forest …) depending on the
 * campaign. This is the seed vocabulary of the `mood` taxonomy.
 */
export const EDITORIAL_MOODS: EditorialMood[] = [
  "quiet",
  "morning",
  "slow",
  "warm",
  "reflective",
  "rain",
  "forest",
  "dessert",
  "night",
  "archive",
  "celebration",
];
