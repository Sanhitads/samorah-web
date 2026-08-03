/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Coupon redemption lifecycle (Phase 1 · points 4/8/9/10) — thin server wrappers over the atomic,
 * race-safe SQL RPCs (reserve/consume/release/restore). The RPCs are the source of truth: they hold the
 * coupon row lock, enforce global + per-customer limits and the zero-benefit rule, and keep
 * coupons.used_count and the coupon_redemptions ledger in lock-step. These wrappers never throw — a
 * redemption problem must never break the payment/cancel path.
 */
import { createAdminClient } from "@/lib/supabase/admin";

const db = () => createAdminClient() as any;

/** Stable per-customer identity: the authenticated user_id when present, else the normalized guest email
 *  (lowercase + trim only — no dot/plus folding, per the approved decision). */
export function redemptionIdentity(userId: string | null | undefined, email: string | null | undefined): string {
  if (userId) return userId;
  const e = (email ?? "").trim().toLowerCase();
  return e ? `guest:${e}` : "guest:unknown";
}

export interface ReserveResult { reserved: boolean; reason?: string; already?: boolean; coupon_id?: string }

/** Hold a coupon slot for an order at checkout (before payment). Returns reserved:false with a reason
 *  (exhausted / per_user / no_benefit / not_found) when it can't — the caller must NOT charge the
 *  discounted amount in that case (never silently overcharge). */
export async function reserveCoupon(p: {
  orderId: string; code: string; identity: string; userId?: string | null; email?: string | null; benefitPaise: number;
}): Promise<ReserveResult> {
  try {
    const { data, error } = await db().rpc("reserve_coupon", {
      p_order_id: p.orderId, p_coupon_code: p.code, p_identity: p.identity,
      p_user_id: p.userId ?? null, p_email: p.email ?? null, p_benefit_paise: Math.max(0, Math.round(p.benefitPaise)),
    });
    if (error) { console.error("reserveCoupon rpc error", error); return { reserved: false, reason: "error" }; }
    return (data as ReserveResult) ?? { reserved: false, reason: "error" };
  } catch (e) { console.error("reserveCoupon failed", e); return { reserved: false, reason: "error" }; }
}

/** Payment succeeded → mark the reservation consumed (idempotent; no-op if nothing was reserved). */
export async function consumeCoupon(orderId: string): Promise<void> {
  try { await db().rpc("consume_coupon", { p_order_id: orderId }); }
  catch (e) { console.error("consumeCoupon failed", e); }
}

/** Free the slot (payment failed / normal cancellation before fulfilment). Idempotent. */
export async function releaseCoupon(orderId: string, reason: string, actor?: { type?: string; id?: string }): Promise<void> {
  try { await db().rpc("release_coupon", { p_order_id: orderId, p_reason: reason, p_actor_type: actor?.type ?? "system", p_actor_id: actor?.id ?? null }); }
  catch (e) { console.error("releaseCoupon failed", e); }
}

/** Admin manual restore of a released redemption (reason MANDATORY; re-holds the slot). */
export async function restoreCoupon(orderId: string, reason: string, actorId?: string): Promise<{ restored: boolean; reason?: string }> {
  try {
    const { data, error } = await db().rpc("restore_coupon", { p_order_id: orderId, p_reason: reason, p_actor_id: actorId ?? null });
    if (error) { console.error("restoreCoupon rpc error", error); return { restored: false, reason: "error" }; }
    return (data as { restored: boolean; reason?: string }) ?? { restored: false, reason: "error" };
  } catch (e) { console.error("restoreCoupon failed", e); return { restored: false, reason: "error" }; }
}
