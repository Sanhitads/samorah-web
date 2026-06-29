/**
 * Relationship engine (§13) — the platform's directed graph of memberships.
 *
 * Responsibility: connect any two entities (product↔experience, page↔page,
 * content↔asset) so chapters, related products, breadcrumbs, recommendations,
 * asset usage and next/previous are ALL resolved from this one graph — never
 * duplicated elsewhere. Edges carry editorial/recommendation metadata and
 * validity dates so campaigns and seasonal content appear/disappear by data.
 * Relationship *types* are first-class (see `relationshipTypes.ts`). Principles:
 * Relationships over Duplication; One Source of Truth.
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

/**
 * Relationship types are managed in the RelationshipType Registry
 * (`relationshipTypes.ts`); this open union keeps the known set autocompleting
 * while allowing new types to be registered without a code change here.
 */
export type RelationType =
  | "chapter"
  | "campaign"
  | "bundle"
  | "gift-guide"
  | "gift-pair"
  | "editorial-world"
  | "related"
  | "recommended-with"
  | "inspired-by"
  | "alternative"
  | "replacement"
  | "part-of"
  | "featured-in"
  | "appears-in"
  | "mood"
  | "season"
  | "seasonal"
  | "homepage"
  | "parent"
  | "child"
  | "previous"
  | "next"
  | (string & {});

export type RelationStrength = "strong" | "medium" | "weak";

/** Optional editorial / recommendation / lifecycle metadata on an edge. */
export interface RelationMeta {
  strength?: RelationStrength;
  weight?: number; // 0–1, fine-grained (recommendation scoring)
  priority?: number; // lower = more important
  reason?: string; // why the relation exists (editorial note)
  createdBy?: string;
  createdAt?: string;
  // — time-aware (campaigns / seasonal / limited editions) —
  validFrom?: string;
  validUntil?: string;
  expiresAt?: string;
  campaignId?: string;
}

/** A directed edge in the relationship graph. */
export interface Relationship extends RelationMeta {
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
export interface ProductRelationship extends RelationMeta {
  productId: string;
  relationType: RelationType;
  targetType: EntityType;
  targetId: string;
  role?: string;
  sortOrder?: number;
}
