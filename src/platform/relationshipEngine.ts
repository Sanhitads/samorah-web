/**
 * Relationship engine (§13) — resolvers over the directed relationship graph.
 *
 * Responsibility: register edges and answer every question the rest of the
 * platform asks — generic traversal (incoming/outgoing/neighbours/related-by-
 * type) plus convenience wrappers (products-for, related-products, asset-usage).
 * Queries are TIME-AWARE by default (expired / not-yet-valid edges drop out), so
 * campaigns and seasonal content appear and disappear by data. This is the SINGLE
 * source of navigation, recommendations, asset usage and related products —
 * no relationship logic lives anywhere else. Framework-agnostic.
 * Principles: Relationships over Duplication; One Source of Truth; API before Interface.
 */
import type {
  Relationship,
  RelationType,
  RelationStrength,
  EntityType,
} from "./relationships";
import type { AssetUsage } from "./asset";
import { isBidirectional } from "./relationshipTypes";

const EDGES: Relationship[] = [];

export function registerRelationships(edges: Relationship[]): void {
  EDGES.push(...edges);
}

/** Test/util — clears the graph. */
export function clearRelationships(): void {
  EDGES.length = 0;
}

/** Is an edge valid at a given moment (validFrom / validUntil / expiresAt)? */
export function isRelationActive(e: Relationship, at: Date): boolean {
  const t = at.getTime();
  if (e.validFrom && new Date(e.validFrom).getTime() > t) return false;
  if (e.validUntil && new Date(e.validUntil).getTime() < t) return false;
  if (e.expiresAt && new Date(e.expiresAt).getTime() < t) return false;
  return true;
}

/** `at` undefined → now (time-filtered); `at: null` → no time filter.
 *  (Date filtering at build time is static — like the campaign system; live with
 *  ISR/dynamic rendering.) */
export interface QueryOpts {
  at?: Date | null;
}

type EdgeQuery = Partial<
  Pick<Relationship, "fromType" | "fromId" | "relationType" | "toType" | "toId">
>;

function byPriority(a: Relationship, b: Relationship): number {
  const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
  const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
  if (pa !== pb) return pa - pb;
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

/** All edges matching a query, time-filtered and ordered (priority → sortOrder). */
export function getRelations(query: EdgeQuery = {}, opts?: QueryOpts): Relationship[] {
  const at = opts?.at === undefined ? new Date() : opts.at;
  return EDGES.filter(
    (e) =>
      (query.fromType === undefined || e.fromType === query.fromType) &&
      (query.fromId === undefined || e.fromId === query.fromId) &&
      (query.relationType === undefined || e.relationType === query.relationType) &&
      (query.toType === undefined || e.toType === query.toType) &&
      (query.toId === undefined || e.toId === query.toId) &&
      (at === null || isRelationActive(e, at)),
  ).sort(byPriority);
}

// — generic graph traversal —
export function getOutgoing(
  entityType: EntityType,
  id: string,
  opts?: QueryOpts,
): Relationship[] {
  return getRelations({ fromType: entityType, fromId: id }, opts);
}

export function getIncoming(
  entityType: EntityType,
  id: string,
  opts?: QueryOpts,
): Relationship[] {
  return getRelations({ toType: entityType, toId: id }, opts);
}

export function getNeighbours(
  entityType: EntityType,
  id: string,
  opts?: QueryOpts,
): Relationship[] {
  return [...getOutgoing(entityType, id, opts), ...getIncoming(entityType, id, opts)];
}

export interface RelatedEntity {
  type: EntityType;
  id: string;
  relationType: RelationType;
  role?: string;
  strength?: RelationStrength;
  weight?: number;
}

/**
 * The entities connected to one — the generic primitive product helpers wrap.
 * Direction "both" surfaces outgoing targets, and incoming sources only for
 * bidirectional relation types (so a `parent` edge isn't read as symmetric).
 */
export function getEntitiesRelatedTo(
  entityType: EntityType,
  id: string,
  opts?: {
    relationType?: RelationType;
    targetType?: EntityType;
    direction?: "out" | "in" | "both";
  } & QueryOpts,
): RelatedEntity[] {
  const dir = opts?.direction ?? "both";
  const out: RelatedEntity[] = [];

  if (dir !== "in") {
    for (const e of getRelations(
      { fromType: entityType, fromId: id, relationType: opts?.relationType, toType: opts?.targetType },
      opts,
    )) {
      out.push({ type: e.toType, id: e.toId, relationType: e.relationType, role: e.role, strength: e.strength, weight: e.weight });
    }
  }
  if (dir !== "out") {
    for (const e of getRelations(
      { toType: entityType, toId: id, relationType: opts?.relationType, fromType: opts?.targetType },
      opts,
    )) {
      if (dir === "in" || isBidirectional(e.relationType)) {
        out.push({ type: e.fromType, id: e.fromId, relationType: e.relationType, role: e.role, strength: e.strength, weight: e.weight });
      }
    }
  }
  return out;
}

// — convenience wrappers (thin, over the generic primitives) —

/** Product ids that belong to a target via a relation (chapter/campaign/…). */
export function getProductsFor(
  relationType: RelationType,
  targetId: string,
  opts?: QueryOpts,
): string[] {
  return getRelations({ fromType: "product", relationType, toId: targetId }, opts).map(
    (e) => e.fromId,
  );
}

/** Product ids related to a product (bidirectional). */
export function getRelatedProducts(
  productId: string,
  limit?: number,
  opts?: QueryOpts,
): string[] {
  const ids = getEntitiesRelatedTo("product", productId, {
    relationType: "related",
    targetType: "product",
    ...opts,
  }).map((r) => r.id);
  return limit ? ids.slice(0, limit) : ids;
}

/** Where an asset is referenced — for the CMS to warn before edit/delete. */
export function getAssetUsage(assetId: string, opts?: QueryOpts): AssetUsage {
  return {
    assetId,
    usedBy: getIncoming("asset", assetId, opts).map((e) => ({
      type: e.fromType,
      id: e.fromId,
      context: e.role,
    })),
  };
}
