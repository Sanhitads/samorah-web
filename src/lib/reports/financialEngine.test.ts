import { describe, it, expect } from "vitest";
import { computeFinancials, REPORTS_CALC_VERSION, type FinancialInputs } from "@/lib/reports/financialEngine";

/**
 * Financial-integrity (invariant) suite for the canonical engine. Purpose: detect accidental financial
 * regressions. Uses integer inputs so the frozen-formula reconciliations hold EXACTLY (no rounding drift).
 */

// A representative window: goods+shipping ex-GST already in netRevenue; GST is a memo; some refunds.
const base: FinancialInputs = {
  orders: 100,
  grossSales: 120_000,       // incl. GST, pre-discount
  discounts: 12_000,
  shippingCollected: 8_000,  // memo — already inside netRevenue ex-GST
  gstCollected: 18_000,      // pass-through memo
  grossCollected: 118_000,   // incl. GST grand total
  netRevenue: 100_000,       // ex-GST income before refunds
  refunds: 5_000,
  cogs: 40_000,
  packaging: 2_000,
  shippingCost: 6_000,       // courier expense
  gatewayFees: 2_360,
  variantsMissingCost: 0,
};

describe("financialEngine — frozen v1 invariants", () => {
  it("exposes the calculation version", () => {
    expect(REPORTS_CALC_VERSION).toBe("v1");
    expect(computeFinancials(base).calcVersion).toBe("v1");
  });

  it("Revenue = Net Revenue − Refunds (Revenue After Refunds)", () => {
    const s = computeFinancials(base);
    expect(s.revenue).toBe(s.netRevenue - s.refunds);
    expect(s.revenue).toBe(95_000);
  });

  it("Operating Profit = Revenue − COGS − Packaging − Shipping(courier) − Gateway Fees", () => {
    const s = computeFinancials(base);
    expect(s.operatingProfit).toBe(s.revenue - s.cogs - s.packaging - s.shippingCost - s.gatewayFees);
    expect(s.operatingProfit).toBe(95_000 - 40_000 - 2_000 - 6_000 - 2_360); // 44_640
  });

  it("Margin = Operating Profit ÷ Revenue (as %), and is 0 when Revenue ≤ 0", () => {
    const s = computeFinancials(base);
    expect(s.margin).toBe(Math.round((s.operatingProfit / s.revenue) * 1000) / 10);
    expect(computeFinancials({ ...base, netRevenue: 0, refunds: 0 }).margin).toBe(0);
    // Revenue fully refunded → 0 revenue → margin 0, never a divide-by-zero blow-up.
    expect(computeFinancials({ ...base, refunds: base.netRevenue }).margin).toBe(0);
  });

  it("GST is a pass-through memo — it NEVER affects Revenue or Operating Profit", () => {
    const withGst = computeFinancials(base);
    const noGst = computeFinancials({ ...base, gstCollected: 0 });
    expect(noGst.revenue).toBe(withGst.revenue);
    expect(noGst.operatingProfit).toBe(withGst.operatingProfit);
  });

  it("shipping income is counted ONCE — shippingCollected (memo) never moves revenue/profit", () => {
    // The pre-R1A double-count bug: adding shipping_amount on top of taxable_amount. Guard against it.
    const a = computeFinancials(base);
    const b = computeFinancials({ ...base, shippingCollected: base.shippingCollected * 3 });
    expect(b.revenue).toBe(a.revenue);
    expect(b.operatingProfit).toBe(a.operatingProfit);
  });

  it("never overstates: refunds can only reduce revenue and profit", () => {
    const noRefund = computeFinancials({ ...base, refunds: 0 });
    const refunded = computeFinancials(base);
    expect(refunded.revenue).toBeLessThan(noRefund.revenue);
    expect(refunded.operatingProfit).toBeLessThan(noRefund.operatingProfit);
    expect(refunded.revenue).toBeLessThanOrEqual(refunded.netRevenue);
  });

  it("is deterministic — identical inputs yield identical output", () => {
    expect(computeFinancials(base)).toEqual(computeFinancials(base));
  });

  it("handles an empty window without NaN/Infinity", () => {
    const empty = computeFinancials({
      orders: 0, grossSales: 0, discounts: 0, shippingCollected: 0, gstCollected: 0, grossCollected: 0,
      netRevenue: 0, refunds: 0, cogs: 0, packaging: 0, shippingCost: 0, gatewayFees: 0, variantsMissingCost: 0,
    });
    expect(empty.revenue).toBe(0);
    expect(empty.operatingProfit).toBe(0);
    expect(empty.margin).toBe(0);
  });
});
