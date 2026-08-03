import { describe, it, expect } from "vitest";
import { computePromotions, type Coupon, type PromoLine } from "@/lib/promotions";

/**
 * Phase 2 — minimum qualifying quantity (#15) + first-order eligibility (#14) in the engine (the
 * immediate-feedback level). First-order context is injected (pure engine); the atomic re-check lives in
 * reserve_coupon.
 */
const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  code: "TEST", label: "T", campaign: "coupon", version: "db",
  priority: 100, stackable: true, exclusive: false, combinableWith: ["FREE_SHIPPING"],
  type: "percentage", value: 10, active: true, ...over,
});
const candle = (qty: number, over: Partial<PromoLine> = {}): PromoLine => ({ key: `c${Math.random()}`, unitPrice: 1000, qty, categoryId: "cat-candle", productType: "candle", ...over });
const SPRAY: PromoLine = { key: "spray", unitPrice: 500, qty: 3, categoryId: "cat-spray", productType: "room_spray" };
const codes = (r: ReturnType<typeof computePromotions>) => r.applied.map((p) => p.code);
const skipReason = (r: ReturnType<typeof computePromotions>, code: string) => r.skipped.find((s) => s.code === code)?.reason;

describe("minimum qualifying quantity (#15) — eligible UNITS after targeting/exclusions", () => {
  const BUY2 = coupon({ code: "BUY2", value: 10, includes: [{ type: "category", id: "cat-candle" }], minQualifyingQuantity: 2 });
  it("1 candle + 3 sprays does NOT qualify (only 1 eligible unit)", () => {
    const r = computePromotions([candle(1), SPRAY], "BUY2", [BUY2]);
    expect(codes(r)).not.toContain("BUY2");
    expect(skipReason(r, "BUY2")).toMatch(/add 1 more qualifying item/);
  });
  it("a single line with qty 2 qualifies (units, not distinct SKUs)", () => {
    expect(codes(computePromotions([candle(2)], "BUY2", [BUY2]))).toContain("BUY2");
  });
  it("excluded units don't count — full-price candle + sale candle = 1 eligible unit", () => {
    const c = coupon({ code: "BUY2S", value: 10, includes: [{ type: "category", id: "cat-candle" }], excludeSale: true, minQualifyingQuantity: 2 });
    const r = computePromotions([candle(1), candle(1, { onSale: true })], "BUY2S", [c]);
    expect(codes(r)).not.toContain("BUY2S"); // sale candle excluded → 1 qualifying unit
  });
  it("bundle/composition units are not decomposed into qualifying units (Phase-1 policy)", () => {
    // 2 candle units, but both are part of a composition → excluded from coupon eligibility → 0 qualifying.
    const r = computePromotions([candle(1, { compositionId: "x" }), candle(1, { compositionId: "x" }), candle(1)], "BUY2", [BUY2]);
    // only the 1 loose candle counts → below 2 → skipped.
    expect(codes(r)).not.toContain("BUY2");
  });
});

describe("first-order eligibility (#14) — injected context", () => {
  const WELCOME = coupon({ code: "WELCOME", value: 10, eligibility: "first_order" });
  it("rejects a KNOWN returning customer immediately (no apply)", () => {
    const r = computePromotions([candle(1)], "WELCOME", [WELCOME], { firstOrder: false });
    expect(codes(r)).not.toContain("WELCOME");
    expect(skipReason(r, "WELCOME")).toMatch(/only valid on your first order/);
  });
  it("applies for a first-order customer", () => {
    expect(codes(computePromotions([candle(1)], "WELCOME", [WELCOME], { firstOrder: true }))).toContain("WELCOME");
  });
  it("unknown identity is allowed at this stage (re-checked at reserve)", () => {
    expect(codes(computePromotions([candle(1)], "WELCOME", [WELCOME]))).toContain("WELCOME");
  });
});
