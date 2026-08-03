/**
 * THE single payment-proven "Successful Redemption" predicate (Phase 3).
 *
 * Every analytics path — list summary, per-coupon detail, contributing-order drill-down and any
 * future reporting — MUST decide "did this redemption really happen and get paid?" through this one
 * function. It is centralized here so the semantics can never drift between call sites.
 *
 * Why all three conditions are required (traced against the redemption RPCs):
 *  1. state ∈ (consumed, restored) — `reserved` is a pre-payment hold; `released` is undone.
 *  2. consumed_at IS NOT NULL — stamped ONLY by consume_coupon on payment success; nullable since the
 *     multi-redemption migration. A `reserved → released → restored` row (admin re-holds a slot that
 *     never paid) is `restored` but has consumed_at = NULL, so state alone does NOT prove payment.
 *  3. order.payment_status ∈ PAID — the canonical, app-wide definition of a successful order. A
 *     cancelled/failed order (or one whose payment was never captured) is excluded even if a stray
 *     ledger row exists.
 *
 * Fully-refunded orders still qualify (`refunded` ∈ PAID) — a real historical redemption occurred;
 * its Attributed Revenue is netted to ₹0 downstream, not excluded here.
 */
import { PAID_STATUSES } from "./couponAttribution";

/** Redemption ledger states that represent a completed (not held, not undone) usage. */
export const QUALIFYING_REDEMPTION_STATES = ["consumed", "restored"] as const;

const QUALIFYING = new Set<string>(QUALIFYING_REDEMPTION_STATES);
const PAID = new Set<string>(PAID_STATUSES);

export interface RedemptionQualifyInput {
  state: string | null | undefined; // coupon_redemptions.state
  consumedAt: string | null | undefined; // coupon_redemptions.consumed_at (payment stamp)
  orderPaymentStatus: string | null | undefined; // orders.payment_status (canonical proof)
}

/** True iff this redemption is a payment-proven Successful Redemption. Used by ALL analytics. */
export function isQualifyingRedemption(r: RedemptionQualifyInput): boolean {
  return (
    QUALIFYING.has(String(r.state)) &&
    r.consumedAt != null &&
    r.orderPaymentStatus != null &&
    PAID.has(String(r.orderPaymentStatus))
  );
}
