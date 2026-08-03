/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Coupon admin service (build: coupon activation). CRUD over the coupons table so
 * the business can create/expire codes without a deploy. Every change is audited.
 * The pricing engine reads these live via loadCouponRegistry (couponService).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { validateCouponConfig, normalizeCouponCode } from "@/lib/couponValidation";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

/** An applies-to / exclusion rule for the admin (mode + type + concrete target). */
export interface AdminCouponTarget {
  mode: "include" | "exclude";
  type: "category" | "collection" | "product" | "product_type" | "variant";
  id?: string | null; // category/collection/product/variant id
  value?: string | null; // product_type canonical string
}

export interface AdminCoupon {
  id: string;
  code: string;
  publicDescription: string | null;
  internalNotes: string | null;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  minQualifyingQuantity: number | null;
  maxUses: number | null;
  maxUsesPerUser: number | null;
  usedCount: number;
  eligibility: "everyone" | "first_order";
  autoApply: boolean;
  combinable: boolean;
  priority: number;
  excludeSale: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  status: "draft" | "active" | "paused" | "archived";
  isActive: boolean; // derived (deprecated) — status === 'active'
  targets: AdminCouponTarget[];
}

export interface CouponInput {
  code: string;
  description?: string; // legacy single field — mapped to publicDescription during transition
  publicDescription?: string | null;
  internalNotes?: string | null;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  maxDiscount?: number | null;
  minOrder?: number;
  minQualifyingQuantity?: number | null;
  maxUses?: number | null;
  maxUsesPerUser?: number | null;
  firstOrderOnly?: boolean; // legacy — mapped to eligibility
  eligibility?: "everyone" | "first_order";
  autoApply?: boolean;
  combinable?: boolean;
  priority?: number;
  excludeSale?: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  status?: "draft" | "active" | "paused" | "archived";
  isActive?: boolean; // legacy toggle — mapped to status active/paused
  targets?: AdminCouponTarget[];
}

function row(i: CouponInput): Record<string, unknown> {
  // Free-shipping coupons have no percentage/amount — persist value 0 + no cap so meaningless form
  // fields can't produce a nonsensical stored coupon.
  const freeShip = i.type === "free_shipping";
  // Description split (point 17): public_description is customer-facing; internal_notes never leaves admin.
  const publicDesc = i.publicDescription ?? i.description ?? null;
  const eligibility = i.eligibility ?? (i.firstOrderOnly ? "first_order" : "everyone");
  return {
    code: normalizeCouponCode(i.code),
    public_description: publicDesc,
    internal_notes: i.internalNotes ?? null,
    description: publicDesc, // keep the deprecated column in sync until it's dropped
    type: i.type,
    value: freeShip ? 0 : i.value,
    max_discount: freeShip ? null : (i.maxDiscount ?? null),
    min_order: i.minOrder ?? 0,
    min_qualifying_quantity: i.minQualifyingQuantity ?? null,
    max_uses: i.maxUses ?? null,
    max_uses_per_user: i.maxUsesPerUser ?? null,
    eligibility,
    first_order_only: eligibility === "first_order", // deprecated mirror
    auto_apply: i.autoApply ?? false,
    combinable: i.combinable ?? false,
    priority: i.priority ?? 100,
    exclude_sale: i.excludeSale ?? false,
    starts_at: i.startsAt || null,
    expires_at: i.expiresAt || null,
    // status is the single source of truth; is_active is derived by trigger.
    status: i.status ?? (i.isActive === false ? "paused" : "active"),
    updated_at: new Date().toISOString(),
  };
}

/** Map an admin target → a coupon_targets row (only the column matching the type is set). */
function targetRow(couponId: string, t: AdminCouponTarget): Record<string, unknown> | null {
  const base = { coupon_id: couponId, mode: t.mode, target_type: t.type };
  switch (t.type) {
    case "category": return t.id ? { ...base, category_id: t.id } : null;
    case "collection": return t.id ? { ...base, collection_id: t.id } : null;
    case "product": return t.id ? { ...base, product_id: t.id } : null;
    case "variant": return t.id ? { ...base, variant_id: t.id } : null;
    case "product_type": return t.value ? { ...base, product_type: t.value } : null;
    default: return null;
  }
}

/** Replace a coupon's target rules (delete-then-insert; dedup so the unique index never trips). */
async function saveTargets(couponId: string, targets: AdminCouponTarget[] | undefined) {
  const db = loose();
  await db.from("coupon_targets").delete().eq("coupon_id", couponId);
  const seen = new Set<string>();
  const rows = (targets ?? [])
    .map((t) => targetRow(couponId, t))
    .filter((r): r is Record<string, unknown> => {
      if (!r) return false;
      const k = `${r.mode}:${r.target_type}:${r.category_id ?? r.collection_id ?? r.product_id ?? r.variant_id ?? r.product_type ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  if (rows.length) await db.from("coupon_targets").insert(rows);
}

function targetsFromRows(rows: any[]): AdminCouponTarget[] {
  return (rows ?? []).map((t: any): AdminCouponTarget => ({
    mode: t.mode, type: t.target_type,
    id: t.category_id ?? t.collection_id ?? t.product_id ?? t.variant_id ?? null,
    value: t.product_type ?? null,
  }));
}

export interface TargetOptions {
  categories: { id: string; name: string }[];
  collections: { id: string; name: string }[];
  products: { id: string; name: string }[];
  productTypes: string[];
}

/** Entity lists for the admin targeting pickers (real ids). Small enough to load fully for an admin tool. */
export async function listTargetOptions(): Promise<TargetOptions> {
  const db = loose();
  const [cats, cols, prods] = await Promise.all([
    db.from("categories").select("id,name").order("name"),
    db.from("collections").select("id,name").order("name"),
    db.from("products").select("id,name").order("name"),
  ]);
  const map = (rows: any[]) => (rows ?? []).map((r: any) => ({ id: r.id, name: r.name as string }));
  return {
    categories: map(cats.data),
    collections: map(cols.data),
    products: map(prods.data),
    productTypes: ["candle", "room_spray", "linen_spray", "wax_tablet", "reed_diffuser", "gift_card"],
  };
}

// ── Promotional banner (admin-controlled storefront strip advertising a code) ─────────────────────────
export interface PromoBanner { enabled: boolean; message: string; code: string | null }
const BANNER_KEY = "promo.banner";

/** Read the promo banner config (visibility is the admin's call via `enabled`). Resilient default. */
export async function getPromoBanner(): Promise<PromoBanner> {
  try {
    const db = loose();
    const { data } = await db.from("settings").select("value").eq("key", BANNER_KEY).maybeSingle();
    const v = (data?.value ?? {}) as Partial<PromoBanner>;
    return { enabled: !!v.enabled, message: typeof v.message === "string" ? v.message : "", code: v.code ? String(v.code) : null };
  } catch {
    return { enabled: false, message: "", code: null };
  }
}

/** Save the promo banner (upsert the settings row). Audited. */
export async function savePromoBanner(input: PromoBanner, actorId?: string) {
  const db = loose();
  const value = { enabled: !!input.enabled, message: (input.message ?? "").trim().slice(0, 200), code: input.code ? normalizeCouponCode(input.code) : null };
  if (value.enabled && !value.message) return { ok: false, reason: "add a message before enabling the banner" };
  const { error } = await db.from("settings").upsert(
    { key: BANNER_KEY, value, section: "general", label: "Promotional banner", updated_by: actorId ?? null, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "promo_banner.updated", actorType: actorId ? "staff" : "system", actorId, notes: value.enabled ? `enabled: ${value.message}` : "disabled" });
  return { ok: true };
}

export interface RedemptionRow {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  couponCode: string;
  identity: string;
  state: "reserved" | "consumed" | "released" | "restored";
  discount: number; // rupees
  reason: string | null;
  reservedAt: string | null;
  consumedAt: string | null;
  releasedAt: string | null;
}

/** Recent coupon redemptions (order → coupon → lifecycle state) for the admin monitor. */
export async function listRedemptions(limit = 60): Promise<RedemptionRow[]> {
  const db = loose();
  const { data } = await db
    .from("coupon_redemptions")
    .select("id, order_id, coupon_code, identity, state, discount_paise, reason, reserved_at, consumed_at, released_at, orders(order_number)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({
    id: r.id, orderId: r.order_id, orderNumber: r.orders?.order_number ?? null,
    couponCode: r.coupon_code, identity: r.identity, state: r.state,
    discount: Math.round(Number(r.discount_paise ?? 0)) / 100, reason: r.reason,
    reservedAt: r.reserved_at, consumedAt: r.consumed_at, releasedAt: r.released_at,
  }));
}

export async function listCoupons(): Promise<AdminCoupon[]> {
  const db = loose();
  const { data } = await db.from("coupons").select("*").order("created_at", { ascending: false });
  const coupons = data ?? [];
  const byCoupon: Record<string, any[]> = {};
  if (coupons.length) {
    const { data: targets } = await db.from("coupon_targets").select("*").in("coupon_id", coupons.map((r: any) => r.id));
    for (const t of targets ?? []) (byCoupon[t.coupon_id] ??= []).push(t);
  }
  return coupons.map((r: any) => ({
    id: r.id, code: r.code, publicDescription: r.public_description ?? null, internalNotes: r.internal_notes ?? null,
    type: r.type, value: Number(r.value),
    maxDiscount: r.max_discount != null ? Number(r.max_discount) : null, minOrder: Number(r.min_order ?? 0),
    minQualifyingQuantity: r.min_qualifying_quantity != null ? Number(r.min_qualifying_quantity) : null,
    maxUses: r.max_uses != null ? Number(r.max_uses) : null, maxUsesPerUser: r.max_uses_per_user != null ? Number(r.max_uses_per_user) : null,
    usedCount: Number(r.used_count ?? 0), eligibility: (r.eligibility ?? "everyone"), autoApply: Boolean(r.auto_apply),
    combinable: Boolean(r.combinable), priority: Number(r.priority ?? 100), excludeSale: Boolean(r.exclude_sale),
    startsAt: r.starts_at, expiresAt: r.expires_at, status: (r.status ?? (r.is_active ? "active" : "paused")), isActive: Boolean(r.is_active),
    targets: targetsFromRows(byCoupon[r.id] ?? []),
  }));
}

/** Authoritative server-side config validation (shared with the admin client) — targeting included. */
function invalid(input: CouponInput): string | null {
  const targets = input.targets ?? [];
  const errs = validateCouponConfig({
    ...input,
    includes: targets.filter((t) => t.mode === "include"),
    excludes: targets.filter((t) => t.mode === "exclude"),
  });
  return errs.length ? errs[0] : null;
}

export async function createCoupon(input: CouponInput, actorId?: string) {
  const bad = invalid(input);
  if (bad) return { ok: false, reason: bad };
  const db = loose();
  const { data, error } = await db.from("coupons").insert(row(input)).select("id").single();
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "code already exists" : error.message };
  await saveTargets(data.id, input.targets);
  await logEvent({ entityType: "settings", event: "coupon.created", actorType: actorId ? "staff" : "system", actorId, notes: normalizeCouponCode(input.code) });
  return { ok: true };
}

export async function updateCoupon(id: string, input: CouponInput, actorId?: string) {
  const bad = invalid(input);
  if (bad) return { ok: false, reason: bad };
  const db = loose();
  const { error } = await db.from("coupons").update(row(input)).eq("id", id);
  // A colliding code hits the DB unique constraint — surface it friendly (was a raw error before).
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "code already exists" : error.message };
  await saveTargets(id, input.targets);
  await logEvent({ entityType: "settings", event: "coupon.updated", actorType: actorId ? "staff" : "system", actorId, notes: normalizeCouponCode(input.code) });
  return { ok: true };
}

/** Admin manual restore of a released redemption (point 10) — reason MANDATORY + audited. */
export async function restoreRedemption(orderId: string, reason: string, actorId?: string) {
  if (!reason?.trim()) return { ok: false, reason: "a reason is required" };
  const { restoreCoupon } = await import("@/services/couponRedemptionService");
  const res = await restoreCoupon(orderId, reason.trim(), actorId);
  if (!res.restored) return { ok: false, reason: res.reason === "not_released" ? "no released redemption to restore" : (res.reason ?? "restore failed") };
  await logEvent({ entityType: "order", entityId: orderId, event: "coupon.redemption_restored", actorType: actorId ? "staff" : "system", actorId, notes: reason.trim() });
  return { ok: true };
}

/** Pause / resume (the list toggle). Writes `status` (the single source; is_active is derived). Pause is a
 *  temporary operational stop — resume keeps the campaign config. (Archive is a separate, retiring action.) */
export async function toggleCoupon(id: string, isActive: boolean, actorId?: string) {
  const db = loose();
  const status = isActive ? "active" : "paused";
  const { error } = await db.from("coupons").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: isActive ? "coupon.activated" : "coupon.paused", actorType: actorId ? "staff" : "system", actorId, entityId: id });
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
