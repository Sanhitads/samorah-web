/**
 * RelationshipType Registry (§13) — relation types as first-class platform
 * concepts, like the Theme Registry.
 *
 * Responsibility: the canonical catalogue of relation types and their semantics
 * (label · category · whether the relation is bidirectional), so the engine and
 * the CMS reason about types instead of scattered string literals. New types
 * register here; the engine treats unknown types conservatively (directional).
 * Framework-agnostic. Principle: One Source of Truth.
 */
import type { RelationType } from "./relationships";

export type RelationTypeCategory =
  | "membership"
  | "navigation"
  | "editorial"
  | "recommendation"
  | "commerce";

export interface RelationTypeDefinition {
  type: RelationType;
  label: string;
  description?: string;
  /** A↔B symmetric (related, gift-pair) vs A→B directional (parent, inspired-by). */
  bidirectional?: boolean;
  category: RelationTypeCategory;
}

export const RELATION_TYPES: RelationTypeDefinition[] = [
  { type: "chapter", label: "Belongs to Chapter", category: "membership" },
  { type: "campaign", label: "In Campaign", category: "membership" },
  { type: "homepage", label: "On Homepage", category: "membership" },
  { type: "editorial-world", label: "In Editorial World", category: "editorial" },
  { type: "part-of", label: "Part Of", category: "membership" },
  { type: "mood", label: "Has Mood", category: "membership" },
  { type: "season", label: "Has Season", category: "membership" },
  { type: "seasonal", label: "Seasonal", category: "membership" },
  { type: "featured-in", label: "Featured In", category: "editorial" },
  { type: "appears-in", label: "Appears In", category: "editorial" },
  { type: "inspired-by", label: "Inspired By", category: "editorial" },
  { type: "related", label: "Related", bidirectional: true, category: "recommendation" },
  { type: "recommended-with", label: "Recommended With", bidirectional: true, category: "recommendation" },
  { type: "gift-pair", label: "Gift Pair", bidirectional: true, category: "recommendation" },
  { type: "alternative", label: "Alternative", bidirectional: true, category: "recommendation" },
  { type: "bundle", label: "In Bundle", category: "commerce" },
  { type: "gift-guide", label: "In Gift Guide", category: "commerce" },
  { type: "replacement", label: "Replacement", category: "commerce" },
  { type: "parent", label: "Parent", category: "navigation" },
  { type: "child", label: "Child", category: "navigation" },
  { type: "previous", label: "Previous", category: "navigation" },
  { type: "next", label: "Next", category: "navigation" },
];

const INDEX: Map<RelationType, RelationTypeDefinition> = new Map(
  RELATION_TYPES.map((r) => [r.type, r] as const),
);

export function getRelationType(
  type: RelationType,
): RelationTypeDefinition | undefined {
  return INDEX.get(type);
}

/** Unknown types default to directional (conservative). */
export function isBidirectional(type: RelationType): boolean {
  return getRelationType(type)?.bidirectional ?? false;
}
