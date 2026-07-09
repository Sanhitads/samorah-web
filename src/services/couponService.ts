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
import type { Coupon } from "@/lib/promotions";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

/** DB coupon row → engine Coupon meta. DB enum: percent|fixed → engine percentage|fixed. */
function mapCoupon(r: any): Coupon {
  return {
    code: String(r.code).toUpperCase(),
    label: r.description ?? String(r.code),
    campaign: r.auto_apply ? "auto" : "coupon",
    version: "db",
    priority: 20,
    stackable: true,
    exclusive: false,
    combinableWith: ["FREE_SHIPPING"], // coupons stack with free shipping, not each other
    type: r.type === "percent" ? "percentage" : "fixed",
    value: Number(r.value),
    minSubtotal: r.min_order != null ? Number(r.min_order) : undefined,
    maxDiscount: r.max_discount != null ? Number(r.max_discount) : undefined,
    active: true,
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

/** Active coupon registry for the pricing engine (server-side reprice). */
export async function loadCouponRegistry(): Promise<Coupon[]> {
  try {
    const db = loose();
    const now = new Date().toISOString();
    const { data } = await db.from("coupons").select("*").eq("is_active", true);
    return (data ?? []).filter((r: any) => isUsable(r, now)).map(mapCoupon);
  } catch {
    return [];
  }
}

export interface CouponValidation {
  ok: boolean;
  reason?: string;
  coupon?: { code: string; type: "percentage" | "fixed"; value: number; minSubtotal?: number; maxDiscount?: number };
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
  return { ok: true, coupon: { code: c.code, type: c.type as "percentage" | "fixed", value: c.value, minSubtotal: c.minSubtotal, maxDiscount: c.maxDiscount } };
}

/** Increment a coupon's usage on order finalize (best-effort; never blocks the order). */
export async function incrementCouponUsage(code: string | null | undefined): Promise<void> {
  if (!code) return;
  try {
    const db = loose();
    const { data } = await db.from("coupons").select("id,used_count").eq("code", code.toUpperCase()).maybeSingle();
    if (!data) return;
    await db.from("coupons").update({ used_count: Number(data.used_count ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", data.id);
  } catch (e) {
    console.error("incrementCouponUsage failed", e);
  }
}
