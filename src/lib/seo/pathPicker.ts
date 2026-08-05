/**
 * Pure state logic for the type-first destination/route picker (UI polish #2/#7). Extracted so the
 * "no stale path across kind switches" guard is unit-testable. Reuses the canonical ENTITY_ROUTE — it
 * does NOT duplicate route mapping and introduces no new resolver.
 */
import { ENTITY_ROUTE, type EntityType } from "@/services/navigationService";

export type PickerKind = "custom" | "home" | EntityType;

export const isEntityKind = (k: PickerKind): k is EntityType =>
  k === "page" || k === "product" || k === "collection" || k === "chapter";

/**
 * The value to commit when the picker KIND changes. Homepage resolves to "/"; every other kind (Custom
 * or an entity kind) resets to empty so a previously-typed custom path or a previously-selected entity
 * path can never linger and be submitted under a different kind.
 */
export function valueForKind(kind: PickerKind): string {
  return kind === "home" ? "/" : "";
}

/** Resolve an entity selection to its canonical storefront path (reuses ENTITY_ROUTE). */
export function entityPath(kind: EntityType, slug: string): string {
  return ENTITY_ROUTE[kind](slug);
}
