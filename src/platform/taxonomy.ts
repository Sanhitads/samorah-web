/**
 * Global Taxonomy (§10) — one vocabulary everything references.
 *
 * Responsibility: the single controlled vocabulary (mood · season · material …)
 * that products, pages, sections, assets and stories tag against — so search,
 * filtering and personalization stay consistent. Principle: Taxonomy over Free Text.
 */
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
