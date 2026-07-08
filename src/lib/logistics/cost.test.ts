import { describe, it, expect } from "vitest";
import { computeLogisticsCost } from "@/lib/logistics/cost";

describe("logistics cost engine (§9)", () => {
  it("prepaid, uninsured: courier + packaging + tax only", () => {
    const c = computeLogisticsCost({ courierCost: 55, packagingCost: 20, declaredValueInr: 900, insured: false, cod: false, taxPct: 18 });
    expect(c.insurance).toBe(0);
    expect(c.codFee).toBe(0);
    expect(c.fuelSurcharge).toBe(0);
    expect(c.tax).toBe(13.5); // (55+20)*18%
    expect(c.total).toBe(88.5);
  });

  it("insured order adds insurance = value × rate", () => {
    const c = computeLogisticsCost({ courierCost: 80, packagingCost: 34, declaredValueInr: 5000, insured: true, insuranceRatePct: 1, cod: false, taxPct: 18 });
    expect(c.insurance).toBe(50); // 5000 × 1%
  });

  it("COD adds a flat + percentage fee; fuel surcharge is on courier cost", () => {
    const c = computeLogisticsCost({ courierCost: 100, packagingCost: 0, declaredValueInr: 2000, insured: false, cod: true, codFeeFlat: 25, codFeePct: 1.5, fuelSurchargePct: 10, taxPct: 18 });
    expect(c.codFee).toBe(55); // 25 + 2000×1.5%
    expect(c.fuelSurcharge).toBe(10); // 100 × 10%
    // taxable = 100 + 0 + 0 + 55 + 10 = 165 → tax 29.7 → total 194.7
    expect(c.tax).toBe(29.7);
    expect(c.total).toBe(194.7);
  });

  it("zero-rate inputs give a clean zero-tax total", () => {
    const c = computeLogisticsCost({ courierCost: 0, packagingCost: 0, declaredValueInr: 0, insured: false, cod: false });
    expect(c.total).toBe(0);
  });
});
