/**
 * Inventory service (Phase 1A) — the read/mutate layer for /admin/inventory, built ONLY on the
 * Phase-0 canonical sources: on-hand = variants.stock; Reserved(live) = variant_reserved() RPC;
 * Available = On Hand − Reserved(live); history = inventory_movements; mutation = adjust_inventory().
 * No stock is recomputed or stored here. The list uses set-based queries (no per-row reservation or
 * history round-trips) — three bounded calls total, regardless of catalogue size.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAirVolumes, airProductType } from "@/config/theHours";
import { available, sellabilityStatus, crossedLowStock, type StockStatus, type AdjustMode } from "@/lib/inventory/adjustLogic";
import { notifyOps } from "@/lib/notifications/opsEngine";

export interface InventoryRow {
  variantId: string; productId: string; productName: string; productType: string; productSlug: string;
  collectionName: string | null; sku: string; variantName: string | null; vessel: string | null; size: string | null;
  onHand: number; reserved: number; available: number; lowStockThreshold: number; isActive: boolean;
  status: StockStatus; lastMovementAt: string | null; lastMovementType: string | null;
}

export interface InventorySummary {
  trackedVariants: number; inStock: number; lowStock: number; outOfStock: number;
  reservedUnits: number; availableUnits: number; notStockTracked: number;
}

export interface UntrackedRow { name: string; productType: string; slug: string; note: string }

export interface MovementRow {
  id: string; createdAt: string; movementType: string; reason: string | null;
  quantityBefore: number; quantityDelta: number; quantityAfter: number;
  sourceType: string; reference: string | null; note: string | null; actorId: string | null;
  sku: string; productName: string; variantName: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// Loosely-typed admin client — the generated database types don't yet include the Phase-0
// inventory objects (inventory_movements table, variant_reserved/adjust_inventory RPCs). Same
// pattern as productAdminService.loose(). The SQL layer remains the source of truth.
type Loose = { from: (t: string) => any; rpc: (fn: string, args: any) => Promise<{ data: any; error: any }> };
function loose(): Loose { return createAdminClient() as unknown as Loose; }

/**
 * The tracked (variant-backed) inventory list. Three bounded queries — no N+1.
 *
 * READ-CONSISTENCY (§5): the three queries are not one snapshot, so under concurrent checkout /
 * finalization the displayed On Hand · Reserved · Available can be momentarily skewed. This is an
 * intentional OPERATIONAL SNAPSHOT — we do not add snapshot isolation for an admin list. It can never
 * cause an unsafe write: adjust_inventory locks the variant row and re-reads authoritative stock +
 * protected reserved INSIDE its transaction, so a stale admin screen can never push On Hand below the
 * protected floor — the server rejects it regardless of what the list showed.
 */
export async function listInventory(): Promise<InventoryRow[]> {
  const db = loose();
  const { data } = await db
    .from("variants")
    .select("id, product_id, sku, variant_name, vessel_type, size_label, stock, low_stock_threshold, is_active, products!inner(name, product_type, slug, collections!collection_id(name))")
    .order("sku");
  const rows: any[] = data ?? [];
  const ids = rows.map((v) => v.id);
  if (!ids.length) return [];

  // (1) Reserved(live) — one set-based RPC for the whole page (the Phase-0 aggregate).
  const reserved = new Map<string, number>();
  const { data: res } = await db.rpc("variant_reserved", { p_variant_ids: ids });
  for (const r of (res as any[]) ?? []) reserved.set(r.variant_id, Number(r.reserved));

  // (2) Last movement — one query over all ids, reduce to the newest per variant in memory.
  const last = new Map<string, { at: string; type: string }>();
  const { data: mv } = await db
    .from("inventory_movements")
    .select("variant_ref, created_at, movement_type")
    .in("variant_ref", ids)
    .order("created_at", { ascending: false });
  for (const m of (mv as any[]) ?? []) if (!last.has(m.variant_ref)) last.set(m.variant_ref, { at: m.created_at, type: m.movement_type });

  return rows.map((v) => {
    const onHand = Number(v.stock ?? 0);
    const rv = reserved.get(v.id) ?? 0;
    const av = available(onHand, rv);
    const threshold = Number(v.low_stock_threshold ?? 5);
    const p = v.products ?? {};
    const lm = last.get(v.id);
    return {
      variantId: v.id, productId: v.product_id, productName: p.name ?? "—", productType: p.product_type ?? "other",
      productSlug: p.slug ?? "", collectionName: p.collections?.name ?? null, sku: v.sku, variantName: v.variant_name,
      vessel: v.vessel_type, size: v.size_label, onHand, reserved: rv, available: av, lowStockThreshold: threshold,
      isActive: Boolean(v.is_active), status: sellabilityStatus(av, threshold),
      lastMovementAt: lm?.at ?? null, lastMovementType: lm?.type ?? null,
    } as InventoryRow;
  });
}

/** Honest analytics from canonical data only (no fabricated inventory value — cost authority unproven). */
export function inventorySummary(rows: InventoryRow[], untracked: number): InventorySummary {
  return {
    trackedVariants: rows.length,
    inStock: rows.filter((r) => r.status === "in_stock").length,
    lowStock: rows.filter((r) => r.status === "low_stock").length,
    outOfStock: rows.filter((r) => r.status === "out_of_stock").length,
    reservedUnits: rows.reduce((s, r) => s + r.reserved, 0),
    availableUnits: rows.reduce((s, r) => s + r.available, 0),
    notStockTracked: untracked,
  };
}

/** Physical products WITHOUT variant-backed stock — the config-driven Air products. Shown as
 *  "Not stock-tracked", never On Hand 0 (D1/req #5). Variant-backed migration is deferred to Phase 2. */
export function listUntrackedPhysical(): UntrackedRow[] {
  const out: UntrackedRow[] = [];
  for (const vol of getAirVolumes()) {
    for (const g of vol.groups) {
      for (const h of g.hours as any[]) {
        out.push({
          name: h.name,
          productType: airProductType(g.kind),
          slug: h.productSlug ?? h.id,
          note: "Config-priced Air product — no variant-backed stock yet (Phase 2).",
        });
      }
    }
  }
  return out;
}

/** Immutable ledger history for one variant, newest first (from inventory_movements only). */
export async function getMovements(variantId: string, limit = 100): Promise<MovementRow[]> {
  const db = loose();
  const { data } = await db
    .from("inventory_movements")
    .select("id, created_at, movement_type, reason, quantity_before, quantity_delta, quantity_after, source_type, reference, note, actor_id, sku_snapshot, product_name_snapshot, variant_name_snapshot")
    .eq("variant_ref", variantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data as any[]) ?? []).map((m) => ({
    id: m.id, createdAt: m.created_at, movementType: m.movement_type, reason: m.reason,
    quantityBefore: m.quantity_before, quantityDelta: m.quantity_delta, quantityAfter: m.quantity_after,
    sourceType: m.source_type, reference: m.reference, note: m.note, actorId: m.actor_id,
    sku: m.sku_snapshot, productName: m.product_name_snapshot, variantName: m.variant_name_snapshot,
  }));
}

export interface AdjustInput {
  variantId: string; mode: AdjustMode; qty: number; reason: string;
  note?: string; reference?: string; actorId?: string; idempotencyKey: string;
}

/** Route a manual adjustment through the canonical, reservation-safe RPC. The idempotency key is
 *  supplied by the caller (stable per submission) so a double-click / retry cannot apply twice. */
export async function adjustInventory(input: AdjustInput): Promise<{ ok: boolean; reason?: string; on_hand?: number; available?: number; reserved?: number; idempotent?: boolean }> {
  const db = loose();
  const { data, error } = await db.rpc("adjust_inventory", {
    p: {
      variant_id: input.variantId, mode: input.mode, qty: input.qty, reason: input.reason,
      note: input.note ?? null, reference: input.reference ?? null, actor_id: input.actorId ?? null,
      idempotency_key: input.idempotencyKey,
    },
  });
  if (error) return { ok: false, reason: error.message };
  const out = data as any;
  // Low-stock check on the manual-adjustment path. Uses the SHARED, ledger-driven, crossing-based
  // helper so manual adjustments and sales behave identically. Skipped on an idempotent no-op.
  if (out?.ok && !out?.idempotent) {
    try { await notifyLowStockForVariants([input.variantId]); } catch { /* alerting must never fail an adjustment */ }
  }
  return out;
}

/**
 * Emit the canonical `inventory.low_stock` ops event for any of these variants whose MOST RECENT
 * movement just crossed the threshold DOWNWARD: previous On Hand > threshold && new On Hand ≤ threshold.
 *
 * Driven off the immutable ledger, so it works for EVERY stock-decreasing path — a manual adjustment
 * AND a completed sale (finalize_order's 'sale' movement). METRIC = On Hand: per Phase-0 D1, low-stock
 * alerting is a REPLENISHMENT signal on physical On Hand — and Available is unchanged by a finalize
 * (the unit was already reserved-out during checkout), so an Available trigger would never fire on a
 * sale. Crossing-only semantics (not "still below") + the event's 12h dedup prevent notification
 * storms. Reuses the EXISTING notification engine — no second alert path. Never throws to its caller.
 */
export async function notifyLowStockForVariants(variantIds: string[]): Promise<void> {
  if (!variantIds.length) return;
  const db = loose();
  const { data: vars } = await db.from("variants").select("id, sku, low_stock_threshold, products!inner(name)").in("id", variantIds);
  const rows: any[] = vars ?? [];
  if (!rows.length) return;
  const { data: mv } = await db.from("inventory_movements")
    .select("variant_ref, quantity_before, quantity_after, quantity_delta, created_at")
    .in("variant_ref", variantIds).order("created_at", { ascending: false });
  const latest = new Map<string, any>();
  for (const m of (mv as any[]) ?? []) if (!latest.has(m.variant_ref)) latest.set(m.variant_ref, m);
  for (const v of rows) {
    const m = latest.get(v.id);
    if (!m) continue;
    const threshold = Number(v.low_stock_threshold ?? 5);
    if (!crossedLowStock(m.quantity_before, m.quantity_after, threshold)) continue; // downward crossing only — no storm
    const outOfStock = m.quantity_after <= 0;
    try {
      await notifyOps("inventory.low_stock", {
        title: outOfStock ? "Out of stock" : "Stock running low",
        message: `${v.products?.name ?? "Product"} (${v.sku}) — on hand ${m.quantity_after}${outOfStock ? "" : `, threshold ${threshold}`}.`,
        entityType: "inventory", entityRef: v.sku, url: "/admin/inventory",
      });
    } catch { /* alerting must never fail the caller */ }
  }
}
