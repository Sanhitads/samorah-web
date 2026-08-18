/**
 * Phase 3.3 — Movement Budget enforcement. The bound is the whole point: cursor bend must never travel.
 */
import { describe, it, expect } from "vitest";
import { clampToBudget, MOVEMENT_BUDGET_PX } from "./movementBudget";

describe("Movement Budget — clampToBudget", () => {
  it("never exceeds ±budget for any finite input", () => {
    for (const v of [-1000, -7, -6, -0.1, 0, 0.1, 6, 7, 1000]) {
      expect(clampToBudget(v)).toBeGreaterThanOrEqual(-MOVEMENT_BUDGET_PX);
      expect(clampToBudget(v)).toBeLessThanOrEqual(MOVEMENT_BUDGET_PX);
    }
  });

  it("passes through values already within budget unchanged", () => {
    expect(clampToBudget(3)).toBe(3);
    expect(clampToBudget(-2.5)).toBe(-2.5);
  });

  it("clamps out-of-budget magnitudes to the cap", () => {
    expect(clampToBudget(50)).toBe(MOVEMENT_BUDGET_PX);
    expect(clampToBudget(-50)).toBe(-MOVEMENT_BUDGET_PX);
  });

  it("collapses non-finite input to 0 (no NaN/Infinity can reach the CSS transform)", () => {
    expect(clampToBudget(Number.NaN)).toBe(0);
    expect(clampToBudget(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampToBudget(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("honours a custom (smaller) budget", () => {
    expect(clampToBudget(100, 2)).toBe(2);
    expect(clampToBudget(-100, 2)).toBe(-2);
  });
});
