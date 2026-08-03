import { describe, it, expect } from "vitest";
import {
  orderNetMerchandisePaise,
  attributeOrder,
  aggregateCouponAttribution,
  type OrderMoney,
  type OrderCoupon,
} from "./couponAttribution";

/** Build an order money summary (paise) with sensible paid defaults. */
function order(over: Partial<OrderMoney> = {}): OrderMoney {
  return {
    orderId: "o1",
    subtotalPaise: 200000, // ₹2000 merchandise, GST-incl
    discountPaise: 0,
    loyaltyDiscountPaise: 0,
    refundPaise: 0,
    paymentStatus: "paid",
    ...over,
  };
}
const merch = (couponId: string, discountPaise: number): OrderCoupon => ({ couponId, discountPaise, isFreeShipping: false });
const ship = (couponId: string, discountPaise: number): OrderCoupon => ({ couponId, discountPaise, isFreeShipping: true });
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("orderNetMerchandisePaise — base + refund policy", () => {
  it("net merchandise = subtotal − discount − loyalty (GST-inclusive), never total_amount", () => {
    expect(orderNetMerchandisePaise(order({ subtotalPaise: 200000, discountPaise: 20000 }))).toBe(180000);
  });
  it("subtracts loyalty_discount (0 today, correct if ever wired)", () => {
    expect(orderNetMerchandisePaise(order({ subtotalPaise: 200000, discountPaise: 20000, loyaltyDiscountPaise: 5000 }))).toBe(175000);
  });
  it("never goes negative", () => {
    expect(orderNetMerchandisePaise(order({ subtotalPaise: 10000, discountPaise: 20000 }))).toBe(0);
  });
  it("FULL refund ⇒ 0 net merchandise (unambiguous)", () => {
    expect(orderNetMerchandisePaise(order({ subtotalPaise: 500000, discountPaise: 50000, paymentStatus: "refunded", refundPaise: 460000 }))).toBe(0);
  });
  it("PARTIAL refund ⇒ conservative cap max(0, grossBase − refund)", () => {
    // gross = 500000 − 50000 = 450000; refund 300000 ⇒ 150000
    expect(orderNetMerchandisePaise(order({ subtotalPaise: 500000, discountPaise: 50000, paymentStatus: "partially_refunded", refundPaise: 300000 }))).toBe(150000);
  });
  it("PARTIAL refund exceeding merchandise base clamps to 0 (never negative)", () => {
    expect(orderNetMerchandisePaise(order({ subtotalPaise: 100000, discountPaise: 0, paymentStatus: "partially_refunded", refundPaise: 120000 }))).toBe(0);
  });
  it("no refund ⇒ full gross base", () => {
    expect(orderNetMerchandisePaise(order({ subtotalPaise: 300000, discountPaise: 30000, paymentStatus: "paid" }))).toBe(270000);
  });
});

describe("attributeOrder — Model A merchandise-only split", () => {
  it("single merchandise coupon takes 100% of the net merchandise base", () => {
    const m = attributeOrder(order({ subtotalPaise: 200000, discountPaise: 15000 }), [merch("A", 15000)]);
    expect(m.get("A")).toBe(185000);
    expect(sum(m)).toBe(185000);
  });

  it("the merchant's worked example: ₹2000 base split 75/25 by ₹150/₹50 discount", () => {
    // net merchandise base = 2000 (no discount reduction in the example's revenue figure)
    const o = order({ subtotalPaise: 200000, discountPaise: 0 });
    const m = attributeOrder(o, [merch("WELCOME10", 15000), merch("VIP50", 5000)]);
    expect(m.get("WELCOME10")).toBe(150000); // 75%
    expect(m.get("VIP50")).toBe(50000); // 25%
    expect(sum(m)).toBe(200000);
  });

  it("FREE-SHIPPING coupon is excluded from the denominator and gets ₹0 (Model A)", () => {
    const o = order({ subtotalPaise: 200000, discountPaise: 15000 });
    const m = attributeOrder(o, [merch("WELCOME10", 15000), ship("FREESHIP", 8000)]);
    expect(m.get("WELCOME10")).toBe(185000); // 100% of net merchandise — free-ship takes none
    expect(m.get("FREESHIP")).toBe(0);
    expect(sum(m)).toBe(185000);
  });

  it("free-ship-only order attributes ₹0 to the free-ship coupon (no merchandise coupon to credit)", () => {
    const o = order({ subtotalPaise: 200000, discountPaise: 0 });
    const m = attributeOrder(o, [ship("FREESHIP", 8000)]);
    expect(m.get("FREESHIP")).toBe(0);
    expect(sum(m)).toBe(0);
  });

  it("deterministic rounding: 3-way split of an odd base sums EXACTLY to the base", () => {
    // base 100001 paise, equal discounts ⇒ 33333.66.. each; remainder distributed deterministically
    const o = order({ subtotalPaise: 100001, discountPaise: 0 });
    const m = attributeOrder(o, [merch("A", 100), merch("B", 100), merch("C", 100)]);
    expect(sum(m)).toBe(100001);
    // remainder (2 paise) goes to the two largest fractional parts; equal fracs tie-break by couponId asc
    expect(m.get("A")).toBe(33334);
    expect(m.get("B")).toBe(33334);
    expect(m.get("C")).toBe(33333);
  });

  it("rounding tie-break is deterministic regardless of input order", () => {
    const o = order({ subtotalPaise: 100001, discountPaise: 0 });
    const forward = attributeOrder(o, [merch("A", 100), merch("B", 100), merch("C", 100)]);
    const reversed = attributeOrder(o, [merch("C", 100), merch("B", 100), merch("A", 100)]);
    expect([...forward.entries()].sort()).toEqual([...reversed.entries()].sort());
  });

  it("zero-discount denominator ⇒ no fabrication (all zero)", () => {
    const o = order({ subtotalPaise: 200000, discountPaise: 0 });
    const m = attributeOrder(o, [merch("A", 0), merch("B", 0)]);
    expect(sum(m)).toBe(0);
  });

  it("zero base (fully refunded) ⇒ all coupons get 0 even with real discounts", () => {
    const o = order({ subtotalPaise: 200000, discountPaise: 20000, paymentStatus: "refunded", refundPaise: 180000 });
    const m = attributeOrder(o, [merch("A", 12000), merch("B", 8000)]);
    expect(sum(m)).toBe(0);
  });

  it("partial refund reduces the pool the coupons split, preserving exact sum", () => {
    const o = order({ subtotalPaise: 500000, discountPaise: 50000, paymentStatus: "partially_refunded", refundPaise: 300000 });
    // netMerch = 150000, split by 30000/20000 ⇒ 60% / 40%
    const m = attributeOrder(o, [merch("A", 30000), merch("B", 20000)]);
    expect(m.get("A")).toBe(90000);
    expect(m.get("B")).toBe(60000);
    expect(sum(m)).toBe(150000);
  });

  it("FULL refund with two coupons ⇒ ₹0 each (both remain redemptions, no revenue)", () => {
    const o = order({ subtotalPaise: 300000, discountPaise: 30000, paymentStatus: "refunded", refundPaise: 300000 });
    const m = attributeOrder(o, [merch("A", 18000), merch("B", 12000)]);
    expect(m.get("A")).toBe(0);
    expect(m.get("B")).toBe(0);
    expect(sum(m)).toBe(0);
  });

  it("paise rounding across 2 coupons with lopsided discounts reconciles exactly", () => {
    const o = order({ subtotalPaise: 99999, discountPaise: 0 });
    const m = attributeOrder(o, [merch("A", 7), merch("B", 3)]); // 70% / 30% of 99999
    expect(sum(m)).toBe(99999);
    expect(m.get("A")).toBe(69999); // 69999.3 → floor 69999
    expect(m.get("B")).toBe(30000); // 29999.7 → floor 29999 + remainder 1
  });
});

describe("historical integrity — attribution uses ledger snapshots, never current config", () => {
  it("uses the discount_paise it is handed, regardless of any later coupon config change", () => {
    // The ledger recorded ₹150 for A at purchase. Even if A is later edited to 25%, attribution here
    // is driven ONLY by the passed discount_paise snapshot — this function has no access to config.
    const o = order({ subtotalPaise: 200000, discountPaise: 0 });
    const m = attributeOrder(o, [merch("A", 15000), merch("B", 5000)]);
    expect(m.get("A")).toBe(150000); // original 75% basis preserved
    expect(m.get("B")).toBe(50000);
  });

  it("a restored redemption carries its ORIGINAL discount_paise into aggregation (not recomputed)", () => {
    const o1 = order({ orderId: "o1", subtotalPaise: 200000, discountPaise: 0 });
    const map = new Map<string, OrderCoupon[]>([["o1", [merch("A", 15000)]]]);
    const a = aggregateCouponAttribution("A", [o1], map);
    expect(a.discountGivenPaise).toBe(15000); // whatever the ledger snapshot says
    expect(a.attributedRevenuePaise).toBe(200000);
  });
});

describe("aggregateCouponAttribution — across orders", () => {
  it("sums a coupon's per-order net allocations + GROSS discount, counts distinct orders", () => {
    const o1 = order({ orderId: "o1", subtotalPaise: 200000, discountPaise: 0 });
    const o2 = order({ orderId: "o2", subtotalPaise: 100000, discountPaise: 0 });
    const map = new Map<string, OrderCoupon[]>([
      ["o1", [merch("A", 15000), merch("B", 5000)]],
      ["o2", [merch("A", 10000)]],
    ]);
    const a = aggregateCouponAttribution("A", [o1, o2], map);
    expect(a.orders).toBe(2);
    expect(a.discountGivenPaise).toBe(25000); // 15000 + 10000 (gross ledger)
    expect(a.attributedRevenuePaise).toBe(150000 + 100000); // 75% of 200000 + 100% of 100000
  });

  it("GROSS discount is NOT reduced by refunds, but attributed revenue IS", () => {
    const paid = order({ orderId: "o1", subtotalPaise: 200000, discountPaise: 0 });
    const refunded = order({ orderId: "o2", subtotalPaise: 200000, discountPaise: 0, paymentStatus: "refunded", refundPaise: 200000 });
    const map = new Map<string, OrderCoupon[]>([
      ["o1", [merch("A", 10000)]],
      ["o2", [merch("A", 10000)]],
    ]);
    const a = aggregateCouponAttribution("A", [paid, refunded], map);
    expect(a.orders).toBe(2); // both are qualified historical redemptions
    expect(a.discountGivenPaise).toBe(20000); // gross, both orders
    expect(a.attributedRevenuePaise).toBe(200000); // only the paid order contributes revenue
  });

  it("a free-ship coupon aggregates redemptions + gross benefit but ₹0 attributed revenue", () => {
    const o1 = order({ orderId: "o1", subtotalPaise: 200000, discountPaise: 15000 });
    const map = new Map<string, OrderCoupon[]>([["o1", [merch("A", 15000), ship("FS", 8000)]]]);
    const fs = aggregateCouponAttribution("FS", [o1], map);
    expect(fs.orders).toBe(1);
    expect(fs.discountGivenPaise).toBe(8000); // shipping benefit shows in Gross Discount Given
    expect(fs.attributedRevenuePaise).toBe(0); // but no merchandise revenue (Model A)
  });
});
