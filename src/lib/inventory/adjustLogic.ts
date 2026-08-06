/**
 * Pure inventory decision logic (Phase 0). Mirrors the canonical SQL RPCs
 * (adjust_inventory / variant_reserved) so the invariants are unit-testable without a
 * database, and so the Phase 1A list/adjust UI derives Available/Status IDENTICALLY to
 * the server. The SQL remains the source of truth for atomicity/locking; these helpers
 * are the ALGEBRA it implements. No independent stock state is stored here (INV-6).
 */

export type AdjustMode = "add" | "remove" | "set";

/** One reservation as far as the algebra cares: a quantity, its expiry, and whether the
 *  order it is linked to is still in the payable lifecycle (status=pending & payment=pending). */
export interface Hold {
  quantity: number;
  expiresAtMs: number;
  orderPayable: boolean; // true iff linked to an order still awaiting payment
}

/** Customer/storefront Reserved = live unexpired holds only (matches available_stock). INV-6/INV-12. */
export function liveReserved(holds: Hold[], nowMs: number): number {
  return holds.reduce((s, h) => s + (h.expiresAtMs > nowMs ? h.quantity : 0), 0);
}

/** Admin adjustment floor = live OR tied to a still-payable order (lifecycle predicate). INV-11.
 *  NEVER bare order-linked: an orphaned hold (order left the payable lifecycle) must NOT freeze stock. */
export function protectedReserved(holds: Hold[], nowMs: number): number {
  return holds.reduce((s, h) => s + (h.expiresAtMs > nowMs || h.orderPayable ? h.quantity : 0), 0);
}

/** Available = On Hand − Reserved(live), floored at 0. The storefront-facing number (INV-12). */
export function available(onHand: number, reservedLive: number): number {
  return Math.max(0, onHand - reservedLive);
}

export type AdjustResult =
  | { ok: true; after: number; delta: number }
  | { ok: false; reason: "bad_request" | "zero_quantity" | "negative_stock" | "below_reserved"; onHand?: number; reserved?: number; attempted?: number };

/** The adjust_inventory decision in pure form. Rejects negative (INV-2) and below-protected (INV-3).
 *  `protectedRes` MUST be the protectedReserved() floor, never liveReserved(). */
export function computeAdjustment(mode: AdjustMode, qty: number, before: number, protectedRes: number): AdjustResult {
  if (mode !== "add" && mode !== "remove" && mode !== "set") return { ok: false, reason: "bad_request" };
  if (!Number.isInteger(qty) || qty < 0) return { ok: false, reason: "bad_request" };
  if (mode !== "set" && qty === 0) return { ok: false, reason: "zero_quantity" };
  const after = mode === "add" ? before + qty : mode === "remove" ? before - qty : qty;
  if (after < 0) return { ok: false, reason: "negative_stock", onHand: before };
  if (after < protectedRes) return { ok: false, reason: "below_reserved", onHand: before, reserved: protectedRes, attempted: after };
  return { ok: true, after, delta: after - before };
}

/** Low-stock alert fires ONLY on a downward threshold crossing of On Hand (previous > threshold &&
 *  new ≤ threshold). Crossing-only means a further decrease while already below does NOT re-fire, so
 *  repeated stock-decreasing operations (manual or sales) can't storm. Works for any decreasing path. */
export function crossedLowStock(before: number, after: number, threshold: number): boolean {
  return after < before && before > threshold && after <= threshold;
}

export type StockStatus = "out_of_stock" | "low_stock" | "in_stock";
/** Sellability status from AVAILABLE (D1: customer-facing). Replenishment/low-stock alerts use On Hand
 *  separately — the two concepts are deliberately NOT collapsed. */
export function sellabilityStatus(availableQty: number, threshold: number): StockStatus {
  if (availableQty <= 0) return "out_of_stock";
  if (availableQty <= threshold) return "low_stock";
  return "in_stock";
}

/** Deterministic idempotency key for a system movement (INV-9). return/rto keys are per-return_id,
 *  so different (partial) returns of the same variant produce DISTINCT keys and are never suppressed. */
export function systemMovementKey(kind: "sale" | "cancel" | "return" | "rto" | "opening", sourceId: string, variantId?: string): string {
  return variantId ? `${kind}:${sourceId}:${variantId}` : `${kind}:${sourceId}`;
}
