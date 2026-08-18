/**
 * Phase 3.4 — Scroll Breathe Validation · BREATH BUDGET (permanent constraint, intensity channel).
 *
 * An instance of the permanent Movement Budget rule (docs/LUXURY_PLATFORM.md) applied to INTENSITY: the
 * maximum opacity modulation the scroll driver may apply, so the breath is perceptible only subconsciously
 * and never reads as a pulse. The RULE is permanent; the NUMBER is an implementation choice, tuned down
 * until imperceptible, and enforced here — in the validation layer — via `clampToBreath`. No engine change:
 * the frozen renderer never sees it; only the experience wrapper's opacity is bounded by it.
 *
 * The budget limits the MAXIMUM effect, not the AVERAGE: smaller scroll velocities stay proportional
 * (`computeBreath` scales linearly below the cap); only excessive velocity is clamped. It is a fixed LOGICAL
 * amount — it never scales with devicePixelRatio, zoom, scroll length, or document height.
 *
 * Chosen cap: 0.06 opacity. One-directional and non-negative — scroll velocity has no sign, and the neutral
 * state is FULL opacity (so a detached light is byte-identical to the static baseline). The breath dims
 * slightly from full and returns to full; it can never over-brighten.
 */
export const BREATH_BUDGET = 0.06;

/** Clamp a computed breath delta into [0, budget]. Non-finite → 0. No overshoot, no negative (no over-bright). */
export function clampToBreath(delta: number, budget: number = BREATH_BUDGET): number {
  if (!Number.isFinite(delta)) return 0;
  return Math.max(0, Math.min(budget, delta));
}
