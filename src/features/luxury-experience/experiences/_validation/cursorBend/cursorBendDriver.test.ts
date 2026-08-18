/**
 * Phase 3.3 — Cursor Bend driver: bounded position modulation + frozen LightDriver conformance.
 */
import { describe, it, expect } from "vitest";
import { computeBend, createCursorBendDriver } from "./cursorBendDriver";
import { MOVEMENT_BUDGET_PX } from "./movementBudget";

describe("computeBend — bounded, budget-capped position delta", () => {
  it("is exactly 0 at the container centre", () => {
    expect(computeBend(0, 100, MOVEMENT_BUDGET_PX)).toBe(0);
  });

  it("never exceeds the Movement Budget, even far outside the container", () => {
    expect(computeBend(100000, 100, MOVEMENT_BUDGET_PX)).toBe(MOVEMENT_BUDGET_PX);
    expect(computeBend(-100000, 100, MOVEMENT_BUDGET_PX)).toBe(-MOVEMENT_BUDGET_PX);
  });

  it("leans TOWARD presence (same sign as the offset) — never inverts", () => {
    expect(computeBend(50, 100, MOVEMENT_BUDGET_PX)).toBeGreaterThan(0);
    expect(computeBend(-50, 100, MOVEMENT_BUDGET_PX)).toBeLessThan(0);
  });

  it("scales proportionally inside the container (half-way → half-budget)", () => {
    expect(computeBend(50, 100, MOVEMENT_BUDGET_PX)).toBeCloseTo(MOVEMENT_BUDGET_PX / 2, 5);
  });

  it("returns 0 for a degenerate / unmeasured container", () => {
    expect(computeBend(20, 0, MOVEMENT_BUDGET_PX)).toBe(0);
    expect(computeBend(20, Number.NaN, MOVEMENT_BUDGET_PX)).toBe(0);
  });
});

describe("createCursorBendDriver — frozen LightDriver conformance", () => {
  const { driver } = createCursorBendDriver();

  it("declares the position channel ONLY (never intensity / colour)", () => {
    expect([...driver.channels]).toEqual(["position"]);
  });

  it("modulate() returns bounded dx/dy CSS lengths and NO intensity delta", () => {
    const m = driver.modulate();
    expect(m.dx).toMatch(/^-?\d+(\.\d+)?px$/);
    expect(m.dy).toMatch(/^-?\d+(\.\d+)?px$/);
    expect(m.dIntensity).toBeUndefined();
  });

  it("has a stable id and a numeric priority (Driver Resolution ordering)", () => {
    expect(driver.id).toBe("cursor-bend");
    expect(typeof driver.priority).toBe("number");
  });
});
