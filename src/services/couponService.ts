/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Coupon service (audit gap: the coupons table existed and was FK'd from orders,
 * but the pricing engine only ever read a hardcoded, all-commented array — so no
 * coupon could ever apply). This loads ACTIVE, in-window, under-limit coupons from
 * the DB and maps them to the engine's Coupon shape, enforces eligibility at apply
 * time, and increments usage when an order finalizes.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { toPaise } from "@/lib/money";
import { couponIsLive, couponStatus, type CouponStatusInput, type CouponLifecycle } from "@/lib/couponStatus";
import type { Coupon, CouponTarget } from "@/lib/promotions";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

/** DB row → the canonical status input (lifecycle intent + window + cap). Single source of truth for
 *  "is this coupon live right now" across pricing, repricing and validation. */
function statusInput(r: any): CouponStatusInput {
  return {
    status: (r.status ?? (r.is_active ? "active" : "paused")) as CouponLifecycle, // is_active fallback (deprecated)
    startsAt: r.starts_at, expiresAt: r.expires_at,
    maxUses: r.max_uses != null ? Number(r.max_uses) : null,
    usedCount: Number(r.used_count ?? 0),
  };
}

/** A coupon_targets row → engine CouponTarget (ID-backed types carry the id; product_type the string). */
function toTarget(t: any): CouponTarget | null {
  switch (t.target_type) {
    case "category": return t.category_id ? { type: "category", id: t.category_id } : null;
    case "collection": return t.collection_id ? { type: "collection", id: t.collection_id } : null;
    case "product": return t.product_id ? { type: "product", id: t.product_id } : null;
    case "variant": return t.variant_id ? { type: "variant", id: t.variant_id } : null;
    case "product_type": return t.product_type ? { type: "product_type", value: t.product_type } : null;
    default: return null;
  }
}

/** DB coupon row (+ its target rows) → engine Coupon meta. DB enum: percent|fixed → engine percentage|fixed. */
function mapCoupon(r: any, targets: any[] = []): Coupon {
  const includes = targets.filter((t) => t.mode === "include").map(toTarget).filter(Boolean) as CouponTarget[];
  const excludes = targets.filter((t) => t.mode === "exclude").map(toTarget).filter(Boolean) as CouponTarget[];
  return {
    code: String(r.code).toUpperCase(),
    // Customer-facing label = public_description ONLY (falls back to code). internal_notes NEVER used here
    // — this label flows into the promotion snapshot shown at checkout + persisted on the order.
    label: r.public_description || String(r.code),
    campaign: r.auto_apply ? "auto" : "coupon",
    version: "db",
    // Stacking config (point 5): `priority` orders application (lower first); `combinable` decides whether
    // it may stack with OTHER discounts. Default (combinable=false) → stacks only with free shipping,
    // reproducing the previous safe behaviour. combinable=true → stacks with any stackable promo.
    priority: r.priority != null ? Number(r.priority) : 100,
    stackable: true,
    exclusive: false,
    combinableWith: r.combinable ? ["*"] : ["FREE_SHIPPING"],
    // DB enum percent|fixed|free_shipping → engine percentage|fixed|free_shipping.
    type: r.type === "percent" ? "percentage" : r.type === "free_shipping" ? "free_shipping" : "fixed",
    value: Number(r.value),
    minSubtotal: r.min_order != null ? Number(r.min_order) : undefined,
    maxDiscount: r.max_discount != null ? Number(r.max_discount) : undefined,
    active: true,
    autoApply: !!r.auto_apply,
    includes: includes.length ? includes : undefined,
    excludes: excludes.length ? excludes : undefined,
    excludeSale: !!r.exclude_sale,
  };
}

/** Active coupon registry for the pricing engine (server-side reprice). Only LIVE coupons — lifecycle
 *  intent `active` + within window + under cap (couponIsLive; archived/paused/draft/scheduled/expired/
 *  exhausted are excluded). Loads each coupon's applies-to / exclusion rules (coupon_targets) so the
 *  engine can restrict the discount to eligible lines. Resilient: targets optional → untargeted. */
export async function loadCouponRegistry(): Promise<Coupon[]> {
  try {
    const db = loose();
    const now = new Date();
    const { data } = await db.from("coupons").select("*").eq("status", "active");
    const usable = (data ?? []).filter((r: any) => couponIsLive(statusInput(r), now));
    if (!usable.length) return [];
    const byCoupon: Record<string, any[]> = {};
    try {
      const ids = usable.map((r: any) => r.id);
      const { data: targets } = await db.from("coupon_targets").select("*").in("coupon_id", ids);
      for (const t of targets ?? []) (byCoupon[t.coupon_id] ??= []).push(t);
    } catch { /* targets are optional — fall back to untargeted coupons */ }
    return usable.map((r: any) => mapCoupon(r, byCoupon[r.id] ?? []));
  } catch {
    return [];
  }
}

export interface CouponValidation {
  ok: boolean;
  reason?: string;
  coupon?: { code: string; type: "percentage" | "fixed" | "free_shipping"; value: number; minSubtotal?: number; maxDiscount?: number };
}

/**
 * Validate a code against a cart (for the checkout "apply" endpoint) — gives the
 * shopper an immediate, specific reason (expired / min not met / used up) instead
 * of a silent no-op. `subtotalPaise` is the cart subtotal.
 */
export async function validateCoupon(code: string, subtotalPaise: number): Promise<CouponValidation> {
  const clean = code.trim().toUpperCase();
  if (!clean) return { ok: false, reason: "Enter a code." };
  const db = loose();
  const { data } = await db.from("coupons").select("*").eq("code", clean).maybeSingle();
  if (!data) return { ok: false, reason: "That code isn't valid." };
  // Canonical status → a specific, customer-safe reason (never leaks internal lifecycle terms).
  const st = couponStatus(statusInput(data), new Date());
  if (st.status !== "active") {
    const reason = st.status === "scheduled" ? "This code isn't active yet." :
      st.status === "expired" ? "This code has expired." :
      st.status === "exhausted" ? "This code has reached its usage limit." :
      st.status === "paused" ? "This code isn't active right now." :
      "That code isn't valid."; // draft / archived → indistinguishable from unknown to the customer
    return { ok: false, reason };
  }
  if (data.min_order != null && subtotalPaise < toPaise(Number(data.min_order))) {
    return { ok: false, reason: `Add ₹${(Number(data.min_order) - subtotalPaise / 100).toFixed(0)} more to use this code (min ₹${Number(data.min_order)}).` };
  }
  const c = mapCoupon(data);
  return { ok: true, coupon: { code: c.code, type: c.type, value: c.value, minSubtotal: c.minSubtotal, maxDiscount: c.maxDiscount } };
}

// NOTE: coupon usage is no longer a best-effort read-then-write counter. Redemption is atomic + race-safe
// via the reserve/consume/release lifecycle (couponRedemptionService + the SQL RPCs): a slot is HELD at
// checkout (reserve), CONSUMED on payment, and RELEASED on cancellation/failure — with used_count mutated
// atomically alongside the coupon_redemptions ledger. See src/services/couponRedemptionService.ts.
