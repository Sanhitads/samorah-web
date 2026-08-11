import { describe, it, expect } from "vitest";
import { validateCosts } from "@/lib/settings/costValidation";

const ok = { packagingPerOrder: 20, shippingCostPerOrder: 60, paymentFeePercent: 2 };

describe("validateCosts (S1B) — corrective validation", () => {
  it("accepts valid costs (0 allowed)", () => {
    expect(validateCosts(ok)).toEqual([]);
    expect(validateCosts({ packagingPerOrder: 0, shippingCostPerOrder: 0, paymentFeePercent: 0 })).toEqual([]);
    expect(validateCosts({ ...ok, paymentFeePercent: 100 })).toEqual([]);
  });

  it("rejects negative packaging with a corrective message", () => {
    const e = validateCosts({ ...ok, packagingPerOrder: -5 });
    expect(e).toHaveLength(1);
    expect(e[0].field).toBe("packagingPerOrder");
    expect(e[0].message).toMatch(/enter 0 or a positive/i); // explains HOW to fix
  });

  it("rejects negative courier cost correctively", () => {
    const e = validateCosts({ ...ok, shippingCostPerOrder: -1 });
    expect(e[0].field).toBe("shippingCostPerOrder");
    expect(e[0].message).toMatch(/e\.g\. 60/);
  });

  it("rejects gateway fee outside 0–100 with the valid range in the message", () => {
    expect(validateCosts({ ...ok, paymentFeePercent: -2 })[0].field).toBe("paymentFeePercent");
    const e = validateCosts({ ...ok, paymentFeePercent: 150 });
    expect(e[0].message).toMatch(/between 0 and 100/i);
    expect(e[0].message).toMatch(/e\.g\. 2 for 2%/);
  });

  it("treats NaN / blank as invalid (not silently 0)", () => {
    const e = validateCosts({ packagingPerOrder: NaN, shippingCostPerOrder: NaN, paymentFeePercent: NaN });
    expect(e.map((x) => x.field).sort()).toEqual(["packagingPerOrder", "paymentFeePercent", "shippingCostPerOrder"]);
  });

  it("reports every invalid field at once", () => {
    expect(validateCosts({ packagingPerOrder: -1, shippingCostPerOrder: -1, paymentFeePercent: 200 })).toHaveLength(3);
  });
});
