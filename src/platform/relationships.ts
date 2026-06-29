/**
 * Relationship engine (§13) — the platform's directed graph of memberships.
 *
 * Responsibility: connect any two entities (product↔experience, page↔page,
 * content↔asset) so chapters, related products, breadcrumbs, next/previous and
 * future experiences are all *resolved from data*, never duplicated. This is the
 * foundation the navigation graph and chapter/related resolvers read from.
 * Principle: Relationships over Duplication.
 */

/** The kinds of things the graph connects. */
export type EntityType =
  | "product"
  | "page"
  | "experience"
  | "journey"
  | "collection"
  | "editorial-world"
  | "campaign"
  | "asset"
  | (string & {});

export type RelationType =
  | "chapter"
  | "campaign"
  | "bundle"
  | "gift-guide"
  | "editorial-world"
  | "related"
  | "mood"
  | "season"
  | "homepage"
  | "parent"
  | "child"
  | "previous"
  | "next";

/** A directed edge in the relationship graph. */
export interface Relationship {
  id?: string;
  fromType: EntityType;
  fromId: string;
  relationType: RelationType;
  toType: EntityType;
  toId: string;
  role?: string; // e.g. "hero" within a chapter
  sortOrder?: number;
}

/** A product-focused view of the graph (the common case). */
export interface ProductRelationship {
  productId: string;
  relationType: RelationType;
  targetType: EntityType;
  targetId: string;
  role?: string;
  sortOrder?: number;
}
