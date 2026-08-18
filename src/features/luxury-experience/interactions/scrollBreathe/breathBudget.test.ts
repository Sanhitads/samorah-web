/**
 * Scroll Breathe — Breath Budget enforcement. The bound is the whole point: the breath must never pulse.
 */
import { describe, it, expect } from "vitest";
import { clampToBreath, BREATH_BUDGET } from "./breathBudget";

describe("Breath Budget — clampToBreath", () => {
  it("keeps every value within [0, budget]", () => {
    for (const v of [-100, -0.01, 0, 0.01, 0.06, 0.5, 100]) {
      const c = clampToBreath(v);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(BREATH_BUDGET);
    }
  });

  it("passes through in-budget values unchanged", () => {
    expect(clampToBreath(0.03)).toBe(0.03);
  });

  it("clamps overshoot to the cap and negatives to 0 (no overshoot, no over-bright)", () => {
    expect(clampToBreath(0.5)).toBe(BREATH_BUDGET);
    expect(clampToBreath(-0.5)).toBe(0);
  });

  it("collapses non-finite input to 0", () => {
    expect(clampToBreath(Number.NaN)).toBe(0);
    expect(clampToBreath(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("honours a custom (smaller) budget", () => {
    expect(clampToBreath(1, 0.02)).toBe(0.02);
  });
});
