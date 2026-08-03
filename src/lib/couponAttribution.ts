/**
 * Coupon revenue attribution (Phase 3 · point 23) — a READ-ONLY reporting model.
 *
 * This never touches order totals, pricing, redemption accounting, invoices or historical
 * snapshots. It consumes the canonical Phase-1/2 ledger (the `orders` money summary + the
 * `coupon_redemptions` discount ledger) and splits an order's NET MERCHANDISE revenue across the
 * MERCHANDISE coupons redeemed on it, pro-rata by each coupon's ledger-recorded discount.
 *
 * LOCKED DECISIONS (traced against the code, confirmed by the merchant):
 *  • Base = NET MERCHANDISE PAID, GST-inclusive:
 *        grossBase = max(0, subtotal − discount_amount − loyalty_discount)
 *    Excludes shipping (a coupon doesn't drive it) and gift-card/loyalty tender (not in this base).
 *    `total_amount` is deliberately NOT used — it carries shipping and is net of gift-card tender.
 *  • Refunds are conservative (the refund ledger does NOT separate merchandise/shipping/tax):
 *        payment_status='refunded'          → netMerch = 0
 *        payment_status='partially_refunded'→ netMerch = max(0, grossBase − refund_amount)  // never overstates
 *        otherwise                          → netMerch = grossBase
 *    (Precise line-level merchandise refund netting is a post-launch item — see roadmap.)
 *  • Model A (merchandise-only): FREE-SHIPPING coupons are EXCLUDED from the denominator and
 *    receive ₹0 attributed merchandise revenue. Their shipping benefit still shows under Gross
 *    Discount Given. Gift cards / store credit / loyalty are not in this ledger at all, so they can
 *    never be mistaken for a coupon's contribution.
 *  • Nothing is reconstructed from current coupon config — `discount_paise` is the immutable snapshot.
 *
 * All maths is in INTEGER PAISE so allocations sum EXACTLY to the base — no float drift.
 *
 * NOTE: which redemption ROWS qualify (state ∈ consumed|restored AND consumed_at IS NOT NULL AND
 * order paid) is enforced in the service query, not here — this core does the money maths on the
 * already-qualifying rows it is handed.
 */

/** Canonical PAID set — the app-wide definition of a successful order (couponService PAID_STATUSES). */
export const PAID_STATUSES = ["paid", "partially_refunded", "refunded"] as const;

/** Canonical per-order money summary (paise). Sourced verbatim from the `orders` row. */
export interface OrderMoney {
  orderId: string;
  subtotalPaise: number; // orders.subtotal — merchandise, GST-inclusive, before discount
  discountPaise: number; // orders.discount_amount — total MERCHANDISE coupon discount
  loyaltyDiscountPaise: number; // orders.loyalty_discount — non-coupon; 0 today (unwired), included for correctness
  refundPaise: number; // orders.refund_amount — settled refunds (flat order-level total)
  paymentStatus: string; // orders.payment_status — drives refund netting
}

/** One redeemed coupon on an order (already payment-qualified), with its exact ledger benefit. */
export interface OrderCoupon {
  couponId: string;
  discountPaise: number; // coupon_redemptions.discount_paise — merchandise discount, OR shipping waived (free-ship)
  isFreeShipping: boolean; // Model A: free-ship benefit is shipping, excluded from the merchandise denominator
}

/**
 * Net merchandise revenue for a single order, in integer paise (never negative). Conservative on
 * refunds because the ledger cannot separate a merchandise refund from a shipping/tax refund.
 */
export function orderNetMerchandisePaise(o: OrderMoney): number {
  const gross = Math.max(0, o.subtotalPaise - o.discountPaise - o.loyaltyDiscountPaise);
  if (o.paymentStatus === "refunded") return 0; // fully refunded ⇒ no net merchandise revenue
  if (o.paymentStatus === "partially_refunded") return Math.max(0, gross - o.refundPaise); // conservative cap
  return gross;
}

/**
 * Split one order's net merchandise revenue across its MERCHANDISE coupons, pro-rata by discount
 * share, with deterministic paise rounding. Returns couponId → attributed paise for EVERY coupon
 * passed (free-ship coupons are included in the map with 0). The merchandise allocations sum EXACTLY
 * to the order's net merchandise base. Zero denominator (or zero base) ⇒ everyone gets 0 — attribution
 * is never fabricated.
 */
export function attributeOrder(o: OrderMoney, coupons: OrderCoupon[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of coupons) out.set(c.couponId, 0);
  const merch = coupons.filter((c) => !c.isFreeShipping); // Model A: free-ship excluded from the split
  const net = orderNetMerchandisePaise(o);
  const denom = merch.reduce((s, c) => s + Math.max(0, c.discountPaise), 0);
  if (net <= 0 || denom <= 0 || merch.length === 0) return out; // explicit no-fabricate branch

  // Largest-remainder apportionment: floor each share, then hand the leftover paise to the largest
  // fractional parts (tie-break by couponId asc) so the total is preserved deterministically.
  const parts = merch.map((c) => {
    const exact = (net * Math.max(0, c.discountPaise)) / denom;
    const floor = Math.floor(exact);
    return { couponId: c.couponId, floor, frac: exact - floor };
  });
  let remainder = net - parts.reduce((s, p) => s + p.floor, 0);
  parts.sort((a, b) => b.frac - a.frac || (a.couponId < b.couponId ? -1 : a.couponId > b.couponId ? 1 : 0));
  for (const p of parts) {
    let paise = p.floor;
    if (remainder > 0) { paise += 1; remainder -= 1; }
    out.set(p.couponId, paise);
  }
  return out;
}

/** Aggregated attribution for a single coupon across many orders (all paise). */
export interface CouponAttribution {
  attributedRevenuePaise: number; // Σ this coupon's per-order net-merchandise allocations (0 for free-ship)
  discountGivenPaise: number; // Σ raw ledger discount (GROSS, never reversed on refund) — independent
  orders: number; // distinct orders the coupon was redeemed on (payment-qualified)
}

/**
 * Aggregate attribution for ONE coupon over its orders. `orderCoupons` must list ALL payment-qualified
 * coupons per order (needed for the pro-rata denominator), not just this one.
 */
export function aggregateCouponAttribution(
  couponId: string,
  orders: OrderMoney[],
  orderCoupons: Map<string, OrderCoupon[]>,
): CouponAttribution {
  let attributed = 0;
  let discount = 0;
  let count = 0;
  for (const o of orders) {
    const coupons = orderCoupons.get(o.orderId) ?? [];
    const mine = coupons.find((c) => c.couponId === couponId);
    if (!mine) continue;
    count += 1;
    discount += Math.max(0, mine.discountPaise); // GROSS ledger discount (incl. free-ship shipping benefit)
    attributed += attributeOrder(o, coupons).get(couponId) ?? 0; // 0 for a free-ship coupon (Model A)
  }
  return { attributedRevenuePaise: attributed, discountGivenPaise: discount, orders: count };
}
