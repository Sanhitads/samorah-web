/**
 * Pick-progress logic (warehouse Priority-1 #2) — pure + testable. Per-item pick tracking backed by
 * order_items.picked_qty (from the fulfillment_ops migration). The board shows "picked / total", and
 * an interrupted pick survives because progress is persisted per line, not held in a session.
 */

/** A requested picked quantity, clamped to a valid whole number in [0, line quantity]. */
export function clampPicked(requested: number, quantity: number): number {
  if (!Number.isFinite(requested)) return 0;
  return Math.min(Math.max(0, Math.floor(requested)), Math.max(0, quantity));
}

export interface PickLine {
  pickedQty: number;
  quantity: number;
}
export interface PickProgress {
  picked: number;
  total: number;
  complete: boolean;
}
/** Consolidated pick progress across an order's lines. `complete` ⇒ every unit is picked. */
export function pickProgress(lines: PickLine[]): PickProgress {
  const picked = lines.reduce((s, l) => s + Math.min(Math.max(0, l.pickedQty), l.quantity), 0);
  const total = lines.reduce((s, l) => s + Math.max(0, l.quantity), 0);
  return { picked, total, complete: total > 0 && picked >= total };
}
