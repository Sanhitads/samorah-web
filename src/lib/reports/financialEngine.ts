/**
 * Canonical Financial Engine (Reports · Stage R1A) — the SINGLE source of truth for every financial value
 * the Reports page displays. Pure and framework-free (no DB, no React), mirroring `lib/analytics/kpi.ts`:
 * data access + summation live in `reportsService`; the authoritative *derivations* (Revenue, Operating
 * Profit, Margin) live here, computed once. No KPI, table, banner, export, or chart may re-derive a
 * financial number — they all consume `FinancialSummary`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * FROZEN FINANCIAL DEFINITIONS — governed by REPORTS_CALC_VERSION. Any intentional change to the logic
 * below MUST bump the version (which also re-stamps historical exports).
 *
 *   Gross Sales        = Σ subtotal                       // GST-INCLUSIVE, pre-discount goods (context)
 *   Discounts          = Σ discount_amount                // GST-inclusive reductions (context)
 *   Shipping collected = Σ shipping_amount                // GST-inclusive shipping income (context/memo)
 *   GST                = Σ (cgst + sgst + igst)           // pass-through memo — NEVER part of profit
 *   Gross Collected    = Σ total_amount                   // GST-inclusive grand total charged
 *   Net Revenue        = Σ taxable_amount                 // ex-GST, post-discount — the canonical income
 *                                                         //   base. taxable_amount ALREADY INCLUDES the
 *                                                         //   ex-GST portion of shipping (see note 1).
 *   Revenue            = Net Revenue − Refunds            // "Revenue After Refunds" — the canonical revenue
 *   Operating Profit   = Revenue − COGS − Packaging − Shipping(courier cost) − Gateway Fees
 *   Margin             = Revenue > 0 ? Operating Profit / Revenue : 0
 *
 * v1 MODELLING NOTES (deliberate, documented — changing any requires a version bump):
 *   1. Net Revenue uses `taxable_amount`, which the commerce engine defines as goodsTaxable + shippingTaxable
 *      (ex-GST). Shipping income is therefore ALREADY inside Net Revenue; it is NOT added again. (The prior
 *      P&L added `shipping_amount` on top of `taxable_amount`, double-counting shipping and OVERSTATING
 *      profit — R1A fixes this.) `shippingCollected` is retained only as a context/memo figure.
 *   2. GST is a pass-through memo and never enters Revenue or Operating Profit.
 *   3. CONSERVATIVE REFUND MODEL (v1 — intentional). Revenue subtracts the ENTIRE `refund_amount`.
 *      `refund_amount` is GST-INCLUSIVE (it reverses the gross money returned to the customer, GST included),
 *      whereas Net Revenue is ex-GST. Subtracting a GST-inclusive refund from an ex-GST base therefore
 *      removes slightly MORE than the pure ex-GST revenue that was reversed — so Revenue (and hence
 *      Operating Profit and Margin) may be slightly UNDERSTATED by the GST share of refunds. This is a
 *      deliberate choice: a financial report must NEVER OVERSTATE revenue, so when the exact split is not
 *      known on the order row we err downward, never upward. A future `REPORTS_CALC_VERSION` may apportion
 *      the ex-GST share of each refund precisely (e.g. refund × taxable_amount / total_amount); doing so
 *      changes the numbers and therefore REQUIRES a version increment.
 *   4. COGS is not reversed for refunded/returned units (restocking is an inventory concern, not modelled
 *      here) — another conservative choice that never overstates profit.
 *   5. Gift cards: `taxable_amount` is pre-gift-card while `total_amount` is post-gift-card, so the two need
 *      not reconcile exactly when a gift card is used. The engine derives only from the inputs it is given.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 */

/** Bump this when the frozen financial definitions above change intentionally. Displayed in R2's banner and
 *  used to stamp historical exports. */
export const REPORTS_CALC_VERSION = "v1";

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Pre-summed components for a window (all rupees; summed by `reportsService` from row-safe queries). */
export interface FinancialInputs {
  orders: number;            // count of paid orders in the window
  grossSales: number;        // Σ subtotal (incl. GST, pre-discount goods)
  discounts: number;         // Σ discount_amount
  shippingCollected: number; // Σ shipping_amount (incl. GST shipping income — memo, not added to revenue)
  gstCollected: number;      // Σ (cgst + sgst + igst) — pass-through memo
  grossCollected: number;    // Σ total_amount (incl. GST grand total)
  netRevenue: number;        // Σ taxable_amount (ex-GST, post-discount, incl. shipping ex-GST)
  refunds: number;           // Σ refund_amount (incl. GST gross reversals)
  cogs: number;              // Σ variant cost × qty
  packaging: number;         // orders × packagingPerOrder
  shippingCost: number;      // orders × shippingCostPerOrder (courier cost — an expense)
  gatewayFees: number;       // grossCollected × paymentFeePercent%
  variantsMissingCost: number; // sold variants with no cost set (profit is optimistic until filled)
}

/** The ONE canonical financial result. Every presentation surface reads from here — none recomputes. */
export interface FinancialSummary {
  calcVersion: string;
  orders: number;
  grossSales: number;        // context (incl. GST, pre-discount)
  discounts: number;         // context
  shippingCollected: number; // memo (incl. GST) — already inside netRevenue ex-GST; never re-added
  gstCollected: number;      // memo (pass-through)
  grossCollected: number;    // incl. GST grand total
  netRevenue: number;        // ex-GST income BEFORE refunds
  refunds: number;
  revenue: number;           // Revenue After Refunds = netRevenue − refunds (canonical revenue)
  cogs: number;
  packaging: number;
  shippingCost: number;      // courier cost expense
  gatewayFees: number;
  operatingProfit: number;   // revenue − cogs − packaging − shippingCost − gatewayFees
  margin: number;            // % — 0 when revenue ≤ 0
  variantsMissingCost: number;
}

/**
 * Apply the frozen v1 formulas. Pure: identical inputs → identical output. Display fields are rounded to
 * the rupee (margin to 0.1%); with integer inputs the reconciliation invariants hold exactly.
 */
export function computeFinancials(i: FinancialInputs): FinancialSummary {
  const revenue = i.netRevenue - i.refunds;
  const operatingProfit = revenue - i.cogs - i.packaging - i.shippingCost - i.gatewayFees;
  const margin = revenue > 0 ? r1((operatingProfit / revenue) * 100) : 0;

  return {
    calcVersion: REPORTS_CALC_VERSION,
    orders: i.orders,
    grossSales: r0(i.grossSales),
    discounts: r0(i.discounts),
    shippingCollected: r0(i.shippingCollected),
    gstCollected: r0(i.gstCollected),
    grossCollected: r0(i.grossCollected),
    netRevenue: r0(i.netRevenue),
    refunds: r0(i.refunds),
    revenue: r0(revenue),
    cogs: r0(i.cogs),
    packaging: r0(i.packaging),
    shippingCost: r0(i.shippingCost),
    gatewayFees: r0(i.gatewayFees),
    operatingProfit: r0(operatingProfit),
    margin,
    variantsMissingCost: i.variantsMissingCost,
  };
}
