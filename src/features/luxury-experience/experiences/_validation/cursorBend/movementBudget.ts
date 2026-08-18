/**
 * Phase 3.3 — Cursor Bend Validation · MOVEMENT BUDGET (permanent implementation constraint).
 *
 * > The maximum positional bend produced by cursor input must remain within a small, predefined limit
 * > relative to the light radius, so the effect is perceptible only subconsciously and never reads as an
 * > object following the cursor.
 *
 * The RULE is permanent (see docs/LUXURY_PLATFORM.md · Movement Budget). The NUMBER is an implementation
 * choice, tuned down until imperceptible. It is enforced here — in the validation layer — via `clampToBudget`
 * and requires NO engine change: the frozen renderer never sees it; only the experience wrapper's transform
 * is bounded by it.
 *
 * Chosen value: 6px per axis ≈ ≤ ~4 % of the premium light radius (clamp(160px, 34vmin, 460px)). A "lean",
 * never a "travel".
 */
export const MOVEMENT_BUDGET_PX = 6;

/**
 * Clamp a raw bend delta (px) into the Movement Budget. Non-finite input (NaN / ±Infinity) collapses to 0 so
 * a bad measurement can never leak into the CSS transform.
 */
export function clampToBudget(delta: number, budget: number = MOVEMENT_BUDGET_PX): number {
  if (!Number.isFinite(delta)) return 0;
  return Math.max(-budget, Math.min(budget, delta));
}
