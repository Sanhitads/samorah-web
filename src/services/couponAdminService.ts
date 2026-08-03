/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Coupon admin service (build: coupon activation). CRUD over the coupons table so
 * the business can create/expire codes without a deploy. Every change is audited.
 * The pricing engine reads these live via loadCouponRegistry (couponService).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  maxUses: number | null;
  usedCount: number;
  firstOrderOnly: boolean;
  autoApply: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

export interface CouponInput {
  code: string;
  description?: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  maxDiscount?: number | null;
  minOrder?: number;
  maxUses?: number | null;
  firstOrderOnly?: boolean;
  autoApply?: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
}

function row(i: CouponInput): Record<string, unknown> {
  // Free-shipping coupons have no percentage/amount — persist value 0 + no cap so meaningless form
  // fields can't produce a nonsensical stored coupon (fuller validation lands in the validation step).
  const freeShip = i.type === "free_shipping";
  return {
    code: i.code.trim().toUpperCase(),
    description: i.description ?? null,
    type: i.type,
    value: freeShip ? 0 : i.value,
    max_discount: freeShip ? null : (i.maxDiscount ?? null),
    min_order: i.minOrder ?? 0,
    max_uses: i.maxUses ?? null,
    first_order_only: i.firstOrderOnly ?? false,
    auto_apply: i.autoApply ?? false,
    starts_at: i.startsAt || null,
    expires_at: i.expiresAt || null,
    is_active: i.isActive ?? true,
    updated_at: new Date().toISOString(),
  };
}

export async function listCoupons(): Promise<AdminCoupon[]> {
  const db = loose();
  const { data } = await db.from("coupons").select("*").order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, code: r.code, description: r.description, type: r.type, value: Number(r.value),
    maxDiscount: r.max_discount != null ? Number(r.max_discount) : null, minOrder: Number(r.min_order ?? 0),
    maxUses: r.max_uses != null ? Number(r.max_uses) : null, usedCount: Number(r.used_count ?? 0),
    firstOrderOnly: Boolean(r.first_order_only), autoApply: Boolean(r.auto_apply),
    startsAt: r.starts_at, expiresAt: r.expires_at, isActive: Boolean(r.is_active),
  }));
}

export async function createCoupon(input: CouponInput, actorId?: string) {
  if (!input.code?.trim()) return { ok: false, reason: "code required" };
  if (input.type === "percent" && input.value > 100) return { ok: false, reason: "percent cannot exceed 100" };
  const db = loose();
  const { error } = await db.from("coupons").insert(row(input));
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "code already exists" : error.message };
  await logEvent({ entityType: "settings", event: "coupon.created", actorType: actorId ? "staff" : "system", actorId, notes: input.code.toUpperCase() });
  return { ok: true };
}

export async function updateCoupon(id: string, input: CouponInput, actorId?: string) {
  if (input.type === "percent" && input.value > 100) return { ok: false, reason: "percent cannot exceed 100" };
  const db = loose();
  const { error } = await db.from("coupons").update(row(input)).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "coupon.updated", actorType: actorId ? "staff" : "system", actorId, notes: input.code.toUpperCase() });
  return { ok: true };
}

export async function toggleCoupon(id: string, isActive: boolean, actorId?: string) {
  const db = loose();
  const { error } = await db.from("coupons").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: isActive ? "coupon.activated" : "coupon.deactivated", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export async function deleteCoupon(id: string, actorId?: string) {
  const db = loose();
  // Orders FK coupon_id ON DELETE SET NULL, so deleting is safe (order snapshot keeps coupon_code).
  const { error } = await db.from("coupons").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "coupon.deleted", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}
