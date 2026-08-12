/**
 * Free-shipping threshold — checkout-correctness regression suite (verification pass).
 * Documents and locks the exact business rules the editable threshold is evaluated against.
 *
 * RULE (from computeOrderTotals): free shipping when `goodsTotal >= threshold`, where
 * `goodsTotal = Σ (unitPrice × qty − lineDiscount)` — i.e. the GST-INCLUSIVE, POST-DISCOUNT
 * MERCHANDISE total, EXCLUDING shipping. Threshold in ₹ → compared in paise.
 */
import { describe, it, expect } from "vitest";
import { computeOrderTotals } from "@/lib/commerce";
import { buildCartSummary } from "@/lib/cart";
import { mergeCart } from "@/lib/account/merge";
import type { Coupon } from "@/lib/promotions";
import { toPaise } from "@/lib/money";

const line = (unitPrice: number, qty = 1) => ({ key: `k${unitPrice}x${qty}`, name: "Candle", unitPrice, qty, taxClass: "candle" });
const FLAT100: Coupon = {
  code: "FLAT100", label: "₹100 off", campaign: "coupon", version: "db", priority: 20,
  stackable: true, exclusive: false, combinableWith: [],
  type: "fixed", value: 100, minSubtotal: undefined, maxDiscount: undefined, active: true,
};

describe("1 · Coupon interaction — threshold is evaluated on the POST-discount goods total", () => {
  it("an order above the threshold that a coupon pulls BELOW it starts paying shipping", () => {
    // ₹1,550 ≥ ₹1,499 → free with no coupon…
    expect(computeOrderTotals([line(1550)]).freeShipping).toBe(true);
    // …but a ₹100 coupon makes goods ₹1,450 (< ₹1,499) → shipping now applies.
    const t = computeOrderTotals([line(1550)], { couponCode: "FLAT100", couponRegistry: [FLAT100] });
    expect(t.discount).toBe(toPaise(100));
    expect(t.goodsTotal).toBe(toPaise(1450));
    expect(t.freeShipping).toBe(false);
    expect(t.shipping).toBeGreaterThan(0);
    expect(t.freeShippingRemaining).toBe(toPaise(49)); // ₹1,499 − ₹1,450
  });
});

describe("2 · Tax interaction — threshold uses the GST-INCLUSIVE merchandise total (not the ex-GST taxable, not incl. shipping)", () => {
  it("a ₹1,499 inclusive line ships free even though its taxable (ex-GST) value is lower", () => {
    const t = computeOrderTotals([line(1499)]); // exactly the default threshold
    expect(t.freeShipping).toBe(true);
    // Proof it's the INCLUSIVE figure being compared: GST was extracted, so taxable < ₹1,499,
    // yet the order still qualifies — i.e. the threshold is NOT compared against the taxable value.
    expect(t.taxableValue).toBeLessThan(toPaise(1499));
    expect(t.goodsTotal).toBe(toPaise(1499));
  });
  it("shipping is NOT counted toward the threshold — ₹1,450 goods stays charged (1450 + 99 ship would exceed it)", () => {
    const t = computeOrderTotals([line(1450)]);
    expect(t.freeShipping).toBe(false);
    expect(t.shipping).toBeGreaterThan(0);
  });
});

describe("3 · Quantity aggregation — quantities contribute to the threshold", () => {
  it("3 × ₹500 = ₹1,500 ships free; 2 × ₹500 = ₹1,000 does not", () => {
    expect(computeOrderTotals([line(500, 3)]).freeShipping).toBe(true);
    expect(computeOrderTotals([line(500, 3)]).goodsTotal).toBe(toPaise(1500));
    expect(computeOrderTotals([line(500, 2)]).freeShipping).toBe(false);
  });
});

describe("4 · Threshold = 0 — every (non-empty) order ships free", () => {
  it("a ₹1 order ships free when the threshold is 0", () => {
    const t = computeOrderTotals([line(1)], { freeShippingThresholdInr: 0 });
    expect(t.freeShipping).toBe(true);
    expect(t.shipping).toBe(0);
    expect(t.freeShippingRemaining).toBe(0);
  });
  it("an empty cart carries no shipping and no free-shipping flag (nothing to ship)", () => {
    const t = computeOrderTotals([], { freeShippingThresholdInr: 0 });
    expect(t.shipping).toBe(0);
    expect(t.freeShipping).toBe(false); // goodsTotal === 0
  });
});

describe("5 · Guest → login cart merge — shipping recomputes from the merged line set", () => {
  it("merged cart (last-write-wins per line) drives shipping through the same engine", () => {
    const guest = [{ key: "a", name: "A", price: 800, qty: 1, updatedAt: 1 }];
    const server = [
      { key: "a", name: "A", price: 800, qty: 2, updatedAt: 5 }, // newer → qty 2 wins
      { key: "b", name: "B", price: 900, qty: 1, updatedAt: 1 },
    ];
    const merged = mergeCart(guest, server) as { key: string; name: string; price: number; qty: number }[];
    // a:2×800 + b:900 = ₹2,500
    const free = buildCartSummary(merged, 2000); // threshold ₹2,000 → ≥ → free
    expect(free.goodsTotal).toBe(toPaise(2500));
    expect(free.freeShipping).toBe(true);
    expect(free.shipping).toBe(0);
    const charged = buildCartSummary(merged, 3000); // threshold ₹3,000 → < → charged
    expect(charged.freeShipping).toBe(false);
    expect(charged.freeShippingRemaining).toBe(toPaise(500)); // ₹3,000 − ₹2,500
  });
});
