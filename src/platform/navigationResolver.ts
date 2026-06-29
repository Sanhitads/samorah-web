/**
 * Navigation resolver (§15) — computes page relationships, never hardcoded.
 *
 * Responsibility: resolve previous/next within an ordered set (chapters,
 * journeys, pages), parent/children/related from the relationship graph, and
 * build breadcrumb trails. Framework-agnostic; callers feed it the ordered data
 * (DB collections, config pages). Principle: Configuration over Hardcoding.
 */
import type { BreadcrumbItem } from "./navigation";
import type { EntityType } from "./relationships";
import { getRelations } from "./relationshipEngine";

export interface OrderedRef {
  id: string;
  order: number;
}

/** Previous / next within an ordered set (e.g. Vol I → Vol II). */
export function resolveSiblings(
  currentId: string,
  items: OrderedRef[],
): { previous?: string; next?: string } {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((x) => x.id === currentId);
  if (i < 0) return {};
  return {
    previous: i > 0 ? sorted[i - 1].id : undefined,
    next: i < sorted.length - 1 ? sorted[i + 1].id : undefined,
  };
}

/** Parent / children / related for an entity, from the relationship graph. */
export function resolveGraphNavigation(
  entityType: EntityType,
  id: string,
): { parent?: string; children: string[]; related: string[] } {
  return {
    parent: getRelations({ fromType: entityType, fromId: id, relationType: "parent" })[0]
      ?.toId,
    children: getRelations({
      fromType: entityType,
      fromId: id,
      relationType: "child",
    }).map((e) => e.toId),
    related: getRelations({
      fromType: entityType,
      fromId: id,
      relationType: "related",
    }).map((e) => e.toId),
  };
}

/** Build a breadcrumb trail from ordered segments (Home → Chapters → Vol I). */
export function buildBreadcrumb(
  segments: { label: string; href: string }[],
): BreadcrumbItem[] {
  return segments.map((s) => ({ label: s.label, href: s.href }));
}
