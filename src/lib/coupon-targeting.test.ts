import { describe, it, expect } from "vitest";
import { computePromotions, couponEligibleLines, type Coupon, type PromoLine } from "@/lib/promotions";
import { computeOrderTotals, type CommerceLine } from "@/lib/commerce";

/**
 * Coupon targeting + exclusions (Phase 1 · points 2/3/11). Proves the engine restricts a coupon to its
 * ELIGIBLE lines and allocates the discount over those only — excluded / non-targeted lines get exactly
 * ₹0 and keep their correct GST. Intrinsic exclusions (gift cards, bundles) need no config.
 */
const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  code: "TEST", label: "Test", campaign: "coupon", version: "db",
  priority: 20, stackable: true, exclusive: false, combinableWith: ["FREE_SHIPPING"],
  type: "percentage", value: 10, active: true, ...over,
});

const CANDLE: PromoLine = { key: "candle", unitPrice: 1000, qty: 1, categoryId: "cat-candle", productType: "candle", productId: "p-candle", variantId: "v-candle" };
const SPRAY: PromoLine = { key: "spray", unitPrice: 500, qty: 1, categoryId: "cat-spray", productType: "room_spray", productId: "p-spray" };
const GIFT: PromoLine = { key: "gift", unitPrice: 2000, qty: 1, productType: "gift_card", isGiftCard: true };
const BUNDLE: PromoLine = { key: "bundleA", unitPrice: 580, qty: 1, compositionId: "c1", categoryId: "cat-candle" };
const SALE: PromoLine = { key: "sale", unitPrice: 800, qty: 1, categoryId: "cat-candle", productId: "p-sale", onSale: true };

const keys = (ls: PromoLine[]) => ls.map((l) => l.key).sort();

describe("couponEligibleLines — precedence (exclusions always win)", () => {
  const all = [CANDLE, SPRAY, GIFT, BUNDLE, SALE];

  it("intrinsically excludes gift cards and bundle/composition lines (no config)", () => {
    expect(keys(couponEligibleLines(all, coupon()))).toEqual(["candle", "sale", "spray"]); // gift + bundle dropped
  });
  it("excludeSale drops sale-priced lines", () => {
    expect(keys(couponEligibleLines(all, coupon({ excludeSale: true })))).toEqual(["candle", "spray"]);
  });
  it("include by category restricts to matching lines", () => {
    expect(keys(couponEligibleLines(all, coupon({ includes: [{ type: "category", id: "cat-candle" }] })))).toEqual(["candle", "sale"]);
  });
  it("include by product_type matches the canonical string", () => {
    expect(keys(couponEligibleLines(all, coupon({ includes: [{ type: "product_type", value: "room_spray" }] })))).toEqual(["spray"]);
  });
  it("explicit exclude ALWAYS wins over an include", () => {
    const c = coupon({ includes: [{ type: "category", id: "cat-candle" }], excludes: [{ type: "product", id: "p-candle" }] });
    expect(keys(couponEligibleLines(all, c))).toEqual(["sale"]); // candle included-then-excluded; sale stays
  });
  it("include by variant is exact", () => {
    expect(keys(couponEligibleLines(all, coupon({ includes: [{ type: "variant", id: "v-candle" }] })))).toEqual(["candle"]);
  });
});

describe("targeted discount allocation (computePromotions)", () => {
  it("a category-targeted % discounts only matching lines; others get ₹0", () => {
    const r = computePromotions([CANDLE, SPRAY], "CANDLE15", [coupon({ code: "CANDLE15", value: 15, includes: [{ type: "category", id: "cat-candle" }] })]);
    expect(r.byLine.candle).toBe(15000); // 15% of ₹1000 = ₹150 = 15000 paise
    expect(r.byLine.spray ?? 0).toBe(0); // non-targeted → exactly ₹0
    expect(r.discount).toBe(15000);
  });
  it("percentage cap applies to the eligible subset", () => {
    const r = computePromotions([CANDLE, SPRAY], "C", [coupon({ code: "C", value: 50, maxDiscount: 100, includes: [{ type: "category", id: "cat-candle" }] })]);
    expect(r.byLine.candle).toBe(10000); // 50% of ₹1000 = ₹500, capped at ₹100 = 10000 paise
    expect(r.byLine.spray ?? 0).toBe(0);
  });
  it("a coupon whose targets match NOTHING in the cart is skipped (₹0 benefit, clear reason)", () => {
    const r = computePromotions([CANDLE], "X", [coupon({ code: "X", includes: [{ type: "category", id: "cat-does-not-exist" }] })]);
    expect(r.discount).toBe(0);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped.some((s) => s.code === "X")).toBe(true);
  });
  it("gift-card lines are never discounted even by an untargeted (entire-order) coupon", () => {
    const r = computePromotions([CANDLE, GIFT], "ALL10", [coupon({ code: "ALL10", value: 10 })]);
    expect(r.byLine.gift ?? 0).toBe(0);
    expect(r.byLine.candle).toBe(10000); // 10% of ₹1000
  });
  it("fixed discount lands entirely on the eligible line", () => {
    const r = computePromotions([CANDLE, SPRAY], "F", [coupon({ code: "F", type: "fixed", value: 900, includes: [{ type: "category", id: "cat-candle" }] })]);
    expect(r.byLine.candle).toBe(90000); // ₹900 fixed (< ₹1000 eligible base) → all on candle
    expect(r.byLine.spray ?? 0).toBe(0);
  });
  it("fixed discount is capped at the ELIGIBLE subtotal, not the whole cart", () => {
    // ₹900 fixed but only the ₹500 spray is eligible → discount capped at ₹500 (never spills to candle).
    const r = computePromotions([CANDLE, SPRAY], "F", [coupon({ code: "F", type: "fixed", value: 900, includes: [{ type: "category", id: "cat-spray" }] })]);
    expect(r.byLine.spray).toBe(50000); // capped at the ₹500 eligible base
    expect(r.byLine.candle ?? 0).toBe(0);
  });
});

describe("free-shipping coupon (point 1) — shipping only, never product taxable value", () => {
  const lines: CommerceLine[] = [{ key: "candle", name: "Candle", unitPrice: 1000, qty: 1, taxClass: "candle" }];
  const reg = [coupon({ code: "FREESHIP", type: "free_shipping", value: 0 })];

  it("waives shipping while leaving the product line's price + GST identical", () => {
    const without = computeOrderTotals(lines, {});
    const withFs = computeOrderTotals(lines, { couponCode: "FREESHIP", couponRegistry: reg });
    expect(without.shipping).toBeGreaterThan(0); // ₹1000 < ₹1499 threshold → shipping normally applies
    expect(withFs.shipping).toBe(0); // coupon waives it
    expect(withFs.freeShipping).toBe(true);
    expect(withFs.discount).toBe(0); // free shipping is NOT a product discount
    const a = withFs.lines.find((l) => l.key === "candle")!;
    const b = without.lines.find((l) => l.key === "candle")!;
    expect(a.discount).toBe(0);
    expect(a.taxableValue).toBe(b.taxableValue); // product taxable value untouched
    expect(a.gst).toBe(b.gst);
  });
  it("applies even when no product line would qualify for a discount (it targets shipping)", () => {
    const giftOnly: CommerceLine[] = [{ key: "gift", name: "Gift Card", unitPrice: 2000, qty: 1, taxClass: "candle", isGiftCard: true }];
    const t = computeOrderTotals(giftOnly, { couponCode: "FREESHIP", couponRegistry: reg });
    expect(t.freeShipping).toBe(true);
    expect(t.lines.find((l) => l.key === "gift")!.discount).toBe(0); // gift card never discounted
  });
});

describe("targeting keeps GST correct on excluded lines (computeOrderTotals)", () => {
  it("excluded spray keeps full price + full 18% GST; candle is discounted at 12%", () => {
    const lines: CommerceLine[] = [
      { key: "candle", name: "Candle", unitPrice: 1000, qty: 1, taxClass: "candle", categoryId: "cat-candle" },
      { key: "spray", name: "Spray", unitPrice: 500, qty: 1, taxClass: "room_spray", categoryId: "cat-spray" },
    ];
    const reg = [coupon({ code: "CANDLE15", value: 15, includes: [{ type: "category", id: "cat-candle" }] })];
    const t = computeOrderTotals(lines, { couponCode: "CANDLE15", couponRegistry: reg });
    const candle = t.lines.find((l) => l.key === "candle")!;
    const spray = t.lines.find((l) => l.key === "spray")!;
    // Spray untouched: full ₹500 inclusive, GST extracted at 18%.
    expect(spray.discount).toBe(0);
    expect(spray.netInclusive).toBe(50000);
    expect(spray.taxableValue + spray.gst).toBe(50000);
    expect(spray.taxableValue).toBe(Math.round(50000 / 1.18));
    // Candle discounted ₹150 → ₹850 inclusive, GST at 12%.
    expect(candle.discount).toBe(15000);
    expect(candle.netInclusive).toBe(85000);
    expect(candle.taxableValue).toBe(Math.round(85000 / 1.12));
    // Header reconciliation: discount is only the candle's; Taxable + GST = Total (incl. shipping).
    expect(t.discount).toBe(15000);
    expect(t.taxableValue + t.gst).toBe(t.total);
  });
});
