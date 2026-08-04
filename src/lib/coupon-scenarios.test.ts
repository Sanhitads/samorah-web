import { describe, it, expect } from "vitest";
import { computePromotions, couponEligibleLines, canCombine, type Coupon, type PromoLine, type PromotionMeta } from "@/lib/promotions";
import { computeOrderTotals, type CommerceLine } from "@/lib/commerce";
import { couponStatus } from "@/lib/couponStatus";
import { normalizeCouponCode, validateCouponConfig } from "@/lib/couponValidation";

/**
 * Phase 4 — coupon domain scenario matrix (pure engine / status / validation layer).
 *
 * One auditable place that exercises each pricing/eligibility/lifecycle scenario against the REAL
 * domain functions (no React). Redemption-lifecycle, limits, idempotency, refunds, audit and admin
 * behaviour — anything that depends on Postgres RPCs — live in coupon-redemption.integration.test.ts.
 */
const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  code: "TEST", label: "Test", campaign: "coupon", version: "db",
  priority: 20, stackable: true, exclusive: false, combinableWith: ["FREE_SHIPPING"],
  type: "percentage", value: 10, active: true, ...over,
});
const meta = (over: Partial<PromotionMeta> = {}): PromotionMeta => ({
  code: "M", label: "M", campaign: "c", version: "v", priority: 20, stackable: true, exclusive: false, combinableWith: [], ...over,
});
// A ₹1000 candle (12% GST class) carrying every targeting identifier, and a ₹500 spray (18%).
const CANDLE: PromoLine = { key: "candle", unitPrice: 1000, qty: 1, categoryId: "cat-candle", collectionId: "chap-glow", productType: "candle", productId: "p-candle", variantId: "v-candle" };
const SPRAY: PromoLine = { key: "spray", unitPrice: 500, qty: 1, categoryId: "cat-spray", collectionId: "chap-air", productType: "room_spray", productId: "p-spray", variantId: "v-spray" };
const disc = (lines: PromoLine[], c: Coupon, code = c.code) => computePromotions(lines, code, [c]).discount;

describe("Phase 4 · discount types", () => {
  it("percentage coupon — 10% of the ₹1000 candle = ₹100", () => {
    expect(disc([CANDLE], coupon({ code: "P10", value: 10 }))).toBe(10_000);
  });
  it("fixed coupon — flat ₹200 off (paise)", () => {
    expect(disc([CANDLE], coupon({ code: "F200", type: "fixed", value: 200 }))).toBe(20_000);
  });
  it("fixed coupon is capped at the cart value (never negative payable)", () => {
    expect(disc([SPRAY], coupon({ code: "F999", type: "fixed", value: 999 }))).toBe(50_000); // ₹500 line
  });
  it("maximum discount cap — 10% of ₹1000 = ₹100 but capped at ₹50", () => {
    expect(disc([CANDLE], coupon({ code: "CAP", value: 10, maxDiscount: 50 }))).toBe(5_000);
  });
  it("minimum order — below ₹999 the coupon does not apply", () => {
    const c = coupon({ code: "MIN", value: 10, minSubtotal: 999 });
    expect(disc([SPRAY], c)).toBe(0); // ₹500 < ₹999
    expect(computePromotions([SPRAY], "MIN", [c]).skipped.some((s) => s.code === "MIN")).toBe(true);
  });
  it("minimum quantity — needs 2 eligible units; 1 does not qualify", () => {
    const c = coupon({ code: "QTY2", value: 10, minQualifyingQuantity: 2 });
    expect(disc([CANDLE], c)).toBe(0);
    expect(disc([{ ...CANDLE, qty: 2 }], c)).toBe(20_000); // 10% of ₹2000
  });
});

describe("Phase 4 · customer eligibility", () => {
  const c = coupon({ code: "FIRST", value: 10, eligibility: "first_order" });
  it("first-order-only — a known returning customer is rejected", () => {
    expect(computePromotions([CANDLE], "FIRST", [c], { firstOrder: false }).discount).toBe(0);
  });
  it("first-order-only — applies for a first-order customer", () => {
    expect(computePromotions([CANDLE], "FIRST", [c], { firstOrder: true }).discount).toBe(10_000);
  });
});

describe("Phase 4 · targeting (include)", () => {
  const both = [CANDLE, SPRAY];
  const only = (c: Coupon) => couponEligibleLines(both, c).map((l) => l.key).sort();
  it("product targeting", () => { expect(only(coupon({ includes: [{ type: "product", id: "p-candle" }] }))).toEqual(["candle"]); });
  it("variant targeting", () => { expect(only(coupon({ includes: [{ type: "variant", id: "v-spray" }] }))).toEqual(["spray"]); });
  it("category targeting", () => { expect(only(coupon({ includes: [{ type: "category", id: "cat-candle" }] }))).toEqual(["candle"]); });
  it("chapter (collection) targeting", () => { expect(only(coupon({ includes: [{ type: "collection", id: "chap-air" }] }))).toEqual(["spray"]); });
  it("product-type targeting", () => { expect(only(coupon({ includes: [{ type: "product_type", value: "candle" }] }))).toEqual(["candle"]); });
  it("a targeted % discounts only matching lines; others get ₹0", () => {
    expect(disc(both, coupon({ code: "C15", value: 15, includes: [{ type: "category", id: "cat-candle" }] }))).toBe(15_000); // 15% of candle only
  });
});

describe("Phase 4 · exclusions (always win)", () => {
  const all = [CANDLE, SPRAY];
  const left = (c: Coupon) => couponEligibleLines(all, c).map((l) => l.key).sort();
  it("excluded product", () => { expect(left(coupon({ excludes: [{ type: "product", id: "p-candle" }] }))).toEqual(["spray"]); });
  it("excluded category", () => { expect(left(coupon({ excludes: [{ type: "category", id: "cat-spray" }] }))).toEqual(["candle"]); });
  it("exclusion overrides a matching include", () => {
    expect(left(coupon({ includes: [{ type: "category", id: "cat-candle" }], excludes: [{ type: "product", id: "p-candle" }] }))).toEqual([]);
  });
  it("sale-product exclusion — excludeSale drops on-sale lines", () => {
    expect(left(coupon({ excludeSale: true })).length).toBe(2); // neither is on sale here
    expect(couponEligibleLines([{ ...CANDLE, onSale: true }, SPRAY], coupon({ excludeSale: true })).map((l) => l.key)).toEqual(["spray"]);
  });
  it("bundle/composition lines are intrinsically excluded (no config)", () => {
    const bundle: PromoLine = { key: "bundle", unitPrice: 580, qty: 1, compositionId: "c1", categoryId: "cat-candle" };
    expect(left2([CANDLE, bundle], coupon())).toEqual(["candle"]);
  });
  it("gift-card lines are never discounted, even by an entire-order coupon", () => {
    const gift: PromoLine = { key: "gift", unitPrice: 2000, qty: 1, isGiftCard: true };
    expect(left2([CANDLE, gift], coupon())).toEqual(["candle"]);
  });
});
const left2 = (ls: PromoLine[], c: Coupon) => couponEligibleLines(ls, c).map((l) => l.key).sort();

describe("Phase 4 · stacking & combinations", () => {
  it("stacking denied — two non-combinable % promotions cannot combine", () => {
    const a = meta({ code: "A", combinableWith: ["FREE_SHIPPING"] });
    const b = meta({ code: "B", combinableWith: ["FREE_SHIPPING"] });
    expect(canCombine(a, "percentage", b, "percentage")).toBe(false);
  });
  it("allowed combination — a % promo stacks with free shipping", () => {
    const pct = meta({ code: "PCT", combinableWith: ["FREE_SHIPPING"] });
    const fs = meta({ code: "FREE_SHIPPING", combinableWith: ["*"] });
    expect(canCombine(pct, "percentage", fs, "free_shipping")).toBe(true);
  });
  it("exclusive promotion never combines", () => {
    const ex = meta({ code: "X", exclusive: true, combinableWith: ["*"] });
    expect(canCombine(ex, "percentage", meta({ code: "Y", combinableWith: ["*"] }), "percentage")).toBe(false);
  });
});

describe("Phase 4 · auto-apply", () => {
  it("with multiple auto-apply coupons, the greatest-benefit eligible one is chosen (no double-apply)", () => {
    const reg = [
      coupon({ code: "AUTO10", value: 10, autoApply: true }),
      coupon({ code: "AUTO20", value: 20, autoApply: true }),
    ];
    const r = computePromotions([CANDLE], undefined, reg);
    expect(r.discount).toBe(20_000); // only AUTO20 (₹200), not 10+20 stacked
    expect(r.applied.filter((p) => p.rule.kind !== "composition").length).toBe(1);
  });
  it("a free-shipping auto-apply stacks WITH the best auto-apply discount", () => {
    const reg = [
      coupon({ code: "AUTO10", value: 10, autoApply: true }),
      coupon({ code: "AUTOFS", type: "free_shipping", value: 0, autoApply: true, combinableWith: ["*"] }),
    ];
    const r = computePromotions([CANDLE], undefined, reg);
    expect(r.discount).toBe(10_000);
    expect(r.freeShipping).toBe(true);
  });
});

describe("Phase 4 · free-shipping calculation", () => {
  const lines: CommerceLine[] = [{ key: "candle", name: "Candle", unitPrice: 1000, qty: 1, taxClass: "candle" }];
  it("waives billed shipping and reports the benefit it saved", () => {
    const reg = [coupon({ code: "FS", type: "free_shipping", value: 0 })];
    const t = computeOrderTotals(lines, { couponCode: "FS", couponRegistry: reg });
    expect(t.shipping).toBe(0);
    expect(t.freeShippingBenefit).toBeGreaterThan(0);
    expect(t.discount).toBe(0); // free shipping is not a merchandise discount
  });
  it("reports ₹0 benefit when the order would already ship free (≥ threshold)", () => {
    const big: CommerceLine[] = [{ key: "c", name: "C", unitPrice: 2000, qty: 1, taxClass: "candle" }];
    const t = computeOrderTotals(big, { couponCode: "FS", couponRegistry: [coupon({ code: "FS", type: "free_shipping", value: 0 })] });
    expect(t.freeShippingBenefit).toBe(0);
  });
});

describe("Phase 4 · GST after discount + line-level allocation", () => {
  it("GST is extracted from the NET (post-discount) inclusive price, per line at its own rate", () => {
    const lines: CommerceLine[] = [{ key: "candle", name: "Candle", unitPrice: 1000, qty: 1, taxClass: "candle" }];
    const t = computeOrderTotals(lines, { couponCode: "C15", couponRegistry: [coupon({ code: "C15", value: 15 })] });
    const candle = t.lines[0];
    expect(candle.discount).toBe(15_000);
    expect(candle.netInclusive).toBe(85_000); // ₹850 after ₹150 off
    expect(candle.taxableValue).toBe(Math.round(85_000 / 1.12)); // 12% extracted from the discounted price
  });
  it("line-level allocation reconciles EXACTLY (Σ line discount = header; taxable + GST = total)", () => {
    const lines: CommerceLine[] = [
      { key: "a", name: "A", unitPrice: 333, qty: 1, taxClass: "candle" },
      { key: "b", name: "B", unitPrice: 333, qty: 1, taxClass: "candle" },
      { key: "c", name: "C", unitPrice: 333, qty: 1, taxClass: "room_spray" },
    ];
    const t = computeOrderTotals(lines, { couponCode: "P10", couponRegistry: [coupon({ code: "P10", value: 10 })] });
    expect(t.lines.reduce((s, l) => s + l.discount, 0)).toBe(t.discount); // no rounding drift
    expect(t.taxableValue + t.gst).toBe(t.total);
    expect(t.discount).toBe(Math.round(99_900 * 0.1)); // 10% of ₹999
  });
});

describe("Phase 4 · lifecycle status (derived)", () => {
  const base = { status: "active" as const, startsAt: null as string | null, expiresAt: null as string | null, maxUses: null as number | null, usedCount: 0 };
  const now = new Date("2026-08-04T00:00:00Z");
  it("expired coupon", () => { expect(couponStatus({ ...base, expiresAt: "2026-08-01T00:00:00Z" }, now).status).toBe("expired"); });
  it("future/scheduled coupon", () => { expect(couponStatus({ ...base, startsAt: "2026-09-01T00:00:00Z" }, now).status).toBe("scheduled"); });
  it("paused coupon", () => { expect(couponStatus({ ...base, status: "paused" }, now).status).toBe("paused"); });
  it("exhausted coupon", () => { expect(couponStatus({ ...base, maxUses: 5, usedCount: 5 }, now).status).toBe("exhausted"); });
  it("archived coupon", () => { expect(couponStatus({ ...base, status: "archived" }, now).status).toBe("archived"); });
  it("active coupon within its window", () => { expect(couponStatus({ ...base, startsAt: "2026-08-01T00:00:00Z", expiresAt: "2026-09-01T00:00:00Z", maxUses: 5, usedCount: 2 }, now).status).toBe("active"); });
});

describe("Phase 4 · code validation & normalization", () => {
  it("case normalization — welcome10 and WELCOME10 are one code", () => {
    expect(normalizeCouponCode(" welcome10 ")).toBe("WELCOME10");
  });
  it("invalid code — empty/malformed is rejected by validation", () => {
    expect(validateCouponConfig({ code: "", type: "percent", value: 10 }).length).toBeGreaterThan(0);
  });
  it("invalid code at the engine — an unknown code applies nothing", () => {
    expect(computePromotions([CANDLE], "NOPE", [coupon({ code: "REAL", value: 10 })]).discount).toBe(0);
  });
});

describe("Phase 4 · server is authoritative (client cannot inject a discount)", () => {
  it("a discount exists ONLY for a coupon in the server registry", () => {
    // computeOrderTotals derives the discount from (lines, registry) alone — CommerceLine has no
    // client-supplied discount field. A code absent from the registry yields ₹0.
    const lines: CommerceLine[] = [{ key: "candle", name: "Candle", unitPrice: 1000, qty: 1, taxClass: "candle" }];
    expect(computeOrderTotals(lines, { couponCode: "FAKE50", couponRegistry: [] }).discount).toBe(0);
    expect(computeOrderTotals(lines, { couponCode: "REAL10", couponRegistry: [coupon({ code: "REAL10", value: 10 })] }).discount).toBe(10_000);
  });
});
