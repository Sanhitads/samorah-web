import { describe, it, expect } from "vitest";
import { computePromotions, type Coupon, type PromoLine } from "@/lib/promotions";

/**
 * Auto-apply selection + stacking (Phase 1 · points 5/6). With no code typed, the engine selects the
 * eligible auto-apply coupon giving the GREATEST customer benefit (deterministic tie-breaks: priority
 * then code). A manual code takes precedence; free-shipping auto-applies stack (never conflict).
 */
const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  code: "C", label: "C", campaign: "coupon", version: "db",
  priority: 100, stackable: true, exclusive: false, combinableWith: ["FREE_SHIPPING"],
  type: "percentage", value: 10, active: true, ...over,
});
const LINE: PromoLine = { key: "a", unitPrice: 1000, qty: 1 }; // ₹1000
const codes = (r: ReturnType<typeof computePromotions>) => r.applied.map((p) => p.code).sort();

describe("auto-apply selection", () => {
  it("with NO code + NO auto-apply coupons, nothing is applied (unchanged behaviour)", () => {
    const r = computePromotions([LINE], undefined, [coupon({ code: "MANUAL", value: 50 })]);
    expect(r.discount).toBe(0);
    expect(r.applied).toHaveLength(0);
  });

  it("picks the GREATEST-benefit eligible auto-apply coupon", () => {
    const r = computePromotions([LINE], undefined, [
      coupon({ code: "AUTO10", value: 10, autoApply: true }),
      coupon({ code: "AUTO20", value: 20, autoApply: true }),
    ]);
    expect(codes(r)).toEqual(["AUTO20"]); // ₹200 beats ₹100
    expect(r.discount).toBe(20000);
  });

  it("breaks a benefit tie by priority (lower first), then by code", () => {
    const r = computePromotions([LINE], undefined, [
      coupon({ code: "AA", value: 10, autoApply: true, priority: 5 }),
      coupon({ code: "BB", value: 10, autoApply: true, priority: 1 }),
    ]);
    expect(codes(r)).toEqual(["BB"]); // equal ₹100 → priority 1 wins
  });

  it("a manual DISCOUNT code takes precedence over a better auto-apply discount", () => {
    const r = computePromotions([LINE], "SAVE5", [
      coupon({ code: "SAVE5", value: 5 }),
      coupon({ code: "AUTO20", value: 20, autoApply: true }),
    ]);
    expect(codes(r)).toEqual(["SAVE5"]); // manual wins even though AUTO20 is bigger
    expect(r.discount).toBe(5000);
  });

  it("respects min-order + targeting for auto-apply (ineligible → not applied)", () => {
    const r = computePromotions([LINE], undefined, [coupon({ code: "AUTOMIN", value: 10, autoApply: true, minSubtotal: 2000 })]);
    expect(r.discount).toBe(0);
  });
});

describe("free-shipping stacking", () => {
  it("a free-shipping auto-apply stacks WITH the best auto-apply discount", () => {
    const r = computePromotions([LINE], undefined, [
      coupon({ code: "AUTO10", value: 10, autoApply: true }),
      coupon({ code: "FREESHIP", type: "free_shipping", value: 0, autoApply: true }),
    ]);
    expect(codes(r)).toEqual(["AUTO10", "FREESHIP"]);
    expect(r.freeShipping).toBe(true);
    expect(r.discount).toBe(10000);
  });

  it("a manual free-shipping code still lets the best auto-apply discount apply", () => {
    const r = computePromotions([LINE], "FREESHIP", [
      coupon({ code: "FREESHIP", type: "free_shipping", value: 0 }),
      coupon({ code: "AUTO15", value: 15, autoApply: true }),
    ]);
    expect(codes(r)).toEqual(["AUTO15", "FREESHIP"]);
    expect(r.freeShipping).toBe(true);
    expect(r.discount).toBe(15000);
  });
});
