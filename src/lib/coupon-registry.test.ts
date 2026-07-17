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
const line = (unitPrice: number, qty = 1) => ({ key: `k${unitPrice}`, name: "Candle", unitPrice, qty, taxClass: "candle" });

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

  // The restore scenario: a customer applies a code to a 3-item cart, goes back, removes an item,
  // and returns to checkout. Only the CODE is restored — the discount must be re-earned against the
  // CURRENT cart, and a code that no longer qualifies must say so rather than read as unknown.
  it("an item removed after applying → discount recomputes against the current cart, with a reason", () => {
    const three = [line(400), line(500), line(300)]; // ₹1200 ≥ ₹999 → qualifies
    const two = [line(400), line(500)];              // ₹900  < ₹999 → no longer qualifies

    const before = computeOrderTotals(three, { couponCode: "WELCOME10", couponRegistry: [WELCOME] });
    expect(before.discount).toBe(toPaise(120)); // 10% of ₹1200

    const after = computeOrderTotals(two, { couponCode: "WELCOME10", couponRegistry: [WELCOME] });
    expect(after.discount).toBe(0);              // the old ₹120 does NOT survive the smaller cart
    expect(after.promotions).toHaveLength(0);
    expect(after.promotionsSkipped).toContainEqual({ code: "WELCOME10", reason: "minimum order of ₹999 not met" });
  });

  it("fixed coupon subtracts its rupee value (capped at the cart)", () => {
    const FIFTY: Coupon = { ...WELCOME, code: "FLAT50", type: "fixed", value: 50, minSubtotal: undefined, maxDiscount: undefined };
    const t = computeOrderTotals([line(2000)], { couponCode: "FLAT50", couponRegistry: [FIFTY] });
    expect(t.discount).toBe(toPaise(50));
  });
});
