import { describe, it, expect } from "vitest";
import { computeOrderTotals } from "@/lib/commerce";
import type { Coupon } from "@/lib/promotions";
import { toPaise } from "@/lib/money";

// A DB-loaded coupon injected as the registry (the server path).
const WELCOME: Coupon = {
  code: "WELCOME10", label: "Welcome 10%", campaign: "coupon", version: "db", priority: 20,
  stackable: true, exclusive: false, combinableWith: ["FREE_SHIPPING"],
  type: "percentage", value: 10, minSubtotal: 999, maxDiscount: 200, active: true,
};
const line = (unitPrice: number, qty = 1) => ({ key: `k${unitPrice}`, unitPrice, qty, hsnRate: 12 });

describe("DB-driven coupon registry (injected into the engine)", () => {
  it("a code only discounts when it's in the injected registry", () => {
    const withReg = computeOrderTotals([line(2000)], { couponCode: "WELCOME10", couponRegistry: [WELCOME] });
    const noReg = computeOrderTotals([line(2000)], { couponCode: "WELCOME10", couponRegistry: [] });
    expect(withReg.discount).toBeGreaterThan(0);
    expect(noReg.discount).toBe(0); // empty registry → the hardcoded array isn't consulted
  });

  it("percent cap (maxDiscount) is honored: 10% of ₹5000 = ₹500 but capped at ₹200", () => {
    const t = computeOrderTotals([line(5000)], { couponCode: "WELCOME10", couponRegistry: [WELCOME] });
    expect(t.discount).toBe(toPaise(200)); // capped, not ₹500
  });

  it("min-order gate: below ₹999 the coupon does not apply", () => {
    const t = computeOrderTotals([line(500)], { couponCode: "WELCOME10", couponRegistry: [WELCOME] });
    expect(t.discount).toBe(0);
  });

  it("fixed coupon subtracts its rupee value (capped at the cart)", () => {
    const FIFTY: Coupon = { ...WELCOME, code: "FLAT50", type: "fixed", value: 50, minSubtotal: undefined, maxDiscount: undefined };
    const t = computeOrderTotals([line(2000)], { couponCode: "FLAT50", couponRegistry: [FIFTY] });
    expect(t.discount).toBe(toPaise(50));
  });
});
