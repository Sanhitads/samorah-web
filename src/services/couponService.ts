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
import type { Coupon, CouponTarget } from "@/lib/promotions";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
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
    label: r.description ?? String(r.code),
    campaign: r.auto_apply ? "auto" : "coupon",
    version: "db",
    // NOTE: stacking metadata stays hardcoded here for now (safe: stacks only with free shipping). The
    // configurable `combinable`/`priority` columns are wired in the later stacking/auto-apply step.
    priority: 20,
    stackable: true,
    exclusive: false,
    combinableWith: ["FREE_SHIPPING"],
    // DB enum percent|fixed|free_shipping → engine percentage|fixed|free_shipping.
    type: r.type === "percent" ? "percentage" : r.type === "free_shipping" ? "free_shipping" : "fixed",
    value: Number(r.value),
    minSubtotal: r.min_order != null ? Number(r.min_order) : undefined,
    maxDiscount: r.max_discount != null ? Number(r.max_discount) : undefined,
    active: true,
    includes: includes.length ? includes : undefined,
    excludes: excludes.length ? excludes : undefined,
    excludeSale: !!r.exclude_sale,
  };
}

/** Whether a raw coupon row is currently usable (active · in window · under cap). */
function isUsable(r: any, nowIso: string): boolean {
  if (!r.is_active) return false;
  if (r.starts_at && r.starts_at > nowIso) return false;
  if (r.expires_at && r.expires_at < nowIso) return false;
  if (r.max_uses != null && Number(r.used_count ?? 0) >= Number(r.max_uses)) return false;
  return true;
}

/** Active coupon registry for the pricing engine (server-side reprice). Loads each usable coupon's
 *  applies-to / exclusion rules (coupon_targets) so the engine can restrict the discount to eligible
 *  lines. Resilient: if the targets table/query fails, coupons still load (as untargeted = entire order). */
export async function loadCouponRegistry(): Promise<Coupon[]> {
  try {
    const db = loose();
    const now = new Date().toISOString();
    const { data } = await db.from("coupons").select("*").eq("is_active", true);
    const usable = (data ?? []).filter((r: any) => isUsable(r, now));
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
  const now = new Date().toISOString();
  if (!data.is_active) return { ok: false, reason: "This code is no longer active." };
  if (data.starts_at && data.starts_at > now) return { ok: false, reason: "This code isn't active yet." };
  if (data.expires_at && data.expires_at < now) return { ok: false, reason: "This code has expired." };
  if (data.max_uses != null && Number(data.used_count ?? 0) >= Number(data.max_uses)) return { ok: false, reason: "This code has reached its usage limit." };
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
