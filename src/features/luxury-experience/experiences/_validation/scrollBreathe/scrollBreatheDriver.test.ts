/**
 * Phase 3.4 — Scroll Breathe driver: bounded intensity modulation + frozen LightDriver conformance.
 */
import { describe, it, expect } from "vitest";
import { computeBreath, createScrollBreatheDriver } from "./scrollBreatheDriver";
import { BREATH_BUDGET } from "./breathBudget";

describe("computeBreath — bounded, budget-capped intensity delta", () => {
  it("is 0 at zero scroll velocity", () => {
    expect(computeBreath(0)).toBe(0);
  });

  it("never exceeds the Breath Budget, even at extreme velocity", () => {
    expect(computeBreath(1e9)).toBe(BREATH_BUDGET);
  });

  it("is non-negative regardless of scroll direction (velocity magnitude only)", () => {
    expect(computeBreath(-1e9)).toBe(BREATH_BUDGET);
    expect(computeBreath(-50)).toBeGreaterThanOrEqual(0);
  });

  it("scales proportionally below the cap", () => {
    const small = computeBreath(10);
    const bigger = computeBreath(20);
    expect(bigger).toBeGreaterThan(small);
    expect(bigger).toBeLessThanOrEqual(BREATH_BUDGET);
  });

  it("returns 0 for non-finite velocity", () => {
    expect(computeBreath(Number.NaN)).toBe(0);
    expect(computeBreath(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("createScrollBreatheDriver — frozen LightDriver conformance", () => {
  const { driver } = createScrollBreatheDriver();

  it("declares the intensity channel ONLY (never position / colour)", () => {
    expect([...driver.channels]).toEqual(["intensity"]);
  });

  it("modulate() returns a dIntensity delta and NO dx/dy", () => {
    const m = driver.modulate();
    expect(typeof m.dIntensity).toBe("number");
    expect(m.dx).toBeUndefined();
    expect(m.dy).toBeUndefined();
  });

  it("has id 'scroll-breathe' and priority 10 (resolves before Cursor's 20)", () => {
    expect(driver.id).toBe("scroll-breathe");
    expect(driver.priority).toBe(10);
  });
});
