/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Coupon admin service (build: coupon activation). CRUD over the coupons table so
 * the business can create/expire codes without a deploy. Every change is audited.
 * The pricing engine reads these live via loadCouponRegistry (couponService).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { validateCouponDraft, validateCouponForActivation, normalizeCouponCode } from "@/lib/couponValidation";

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

/** Authoritative server-side validation (shared with the admin client). Draft = lenient (save incomplete);
 *  saving as active/paused/archived = strict activation readiness (point 7). Targeting included. */
function invalid(input: CouponInput): string | null {
  const targets = input.targets ?? [];
  const withTargets = { ...input, includes: targets.filter((t) => t.mode === "include"), excludes: targets.filter((t) => t.mode === "exclude") };
  const errs = input.status === "draft" ? validateCouponDraft(withTargets) : validateCouponForActivation(withTargets);
  return errs.length ? errs[0] : null;
}

/** A stored coupon row (+ targets) → the validator's config shape, for activation-readiness checks. */
function rowToConfig(c: any, targets: any[]) {
  const tg = targetsFromRows(targets ?? []);
  return {
    code: c.code, type: c.type, value: Number(c.value),
    maxDiscount: c.max_discount, minOrder: c.min_order, maxUses: c.max_uses, maxUsesPerUser: c.max_uses_per_user,
    minQualifyingQuantity: c.min_qualifying_quantity, startsAt: c.starts_at, expiresAt: c.expires_at,
    includes: tg.filter((x) => x.mode === "include"), excludes: tg.filter((x) => x.mode === "exclude"),
  };
}

// ── Structured audit diffs (point 20) — before/after per field, reusing the existing audit_events infra ──
const AUDIT_FIELDS: { col: string; label: string }[] = [
  { col: "type", label: "type" }, { col: "value", label: "value" }, { col: "max_discount", label: "maxDiscount" },
  { col: "min_order", label: "minOrder" }, { col: "min_qualifying_quantity", label: "minQualifyingQuantity" },
  { col: "max_uses", label: "maxUses" }, { col: "max_uses_per_user", label: "maxUsesPerUser" },
  { col: "eligibility", label: "eligibility" }, { col: "starts_at", label: "startsAt" }, { col: "expires_at", label: "expiresAt" },
  { col: "combinable", label: "combinable" }, { col: "priority", label: "priority" }, { col: "auto_apply", label: "autoApply" },
  { col: "exclude_sale", label: "excludeSale" }, { col: "public_description", label: "publicDescription" }, { col: "internal_notes", label: "internalNotes" },
];
type Change = { before: unknown; after: unknown };
const targetKey = (t: any) => `${t.mode}:${t.target_type ?? t.type}:${t.category_id ?? t.collection_id ?? t.product_id ?? t.variant_id ?? t.product_type ?? t.id ?? t.value ?? ""}`;

/** Diff the coupon config (row columns + targets) old→new into { field: {before, after} }. */
function diffCoupon(oldRow: Record<string, any>, newRow: Record<string, any>, oldTargets: any[], newTargets: AdminCouponTarget[] | undefined): Record<string, Change> {
  const changes: Record<string, Change> = {};
  for (const { col, label } of AUDIT_FIELDS) {
    const b = oldRow[col] ?? null, a = newRow[col] ?? null;
    if (String(b) !== String(a)) changes[label] = { before: b, after: a };
  }
  const oldKeys = (oldTargets ?? []).map(targetKey).sort();
  const newKeys = (newTargets ?? []).map(targetKey).sort();
  if (JSON.stringify(oldKeys) !== JSON.stringify(newKeys)) changes.targets = { before: oldKeys, after: newKeys };
  return changes;
}

export async function createCoupon(input: CouponInput, actorId?: string) {
  const bad = invalid(input);
  if (bad) return { ok: false, reason: bad };
  const db = loose();
  const { data, error } = await db.from("coupons").insert(row(input)).select("id").single();
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "code already exists" : error.message };
  await saveTargets(data.id, input.targets);
  await logEvent({ entityType: "settings", event: "coupon.created", entityId: data.id, actorType: actorId ? "staff" : "system", actorId, notes: normalizeCouponCode(input.code) });
  return { ok: true };
}

export async function updateCoupon(id: string, input: CouponInput, actorId?: string) {
  const bad = invalid(input);
  if (bad) return { ok: false, reason: bad };
  const db = loose();
  const { data: oldRow } = await db.from("coupons").select("*").eq("id", id).maybeSingle();
  const { data: oldTargets } = await db.from("coupon_targets").select("*").eq("coupon_id", id);
  const newRow = row(input);
  const { error } = await db.from("coupons").update(newRow).eq("id", id);
  // A colliding code hits the DB unique constraint — surface it friendly (was a raw error before).
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "code already exists" : error.message };
  await saveTargets(id, input.targets);
  // Structured before/after diff → audit metadata (the UI renders sentences from this).
  const changes = diffCoupon(oldRow ?? {}, newRow, oldTargets ?? [], input.targets);
  await logEvent({ entityType: "settings", event: "coupon.updated", entityId: id, actorType: actorId ? "staff" : "system", actorId, notes: normalizeCouponCode(input.code), metadata: Object.keys(changes).length ? { changes } : undefined });
  return { ok: true };
}

export interface CouponAuditEntry {
  id: string;
  event: string;
  actorType: string | null;
  actorId: string | null;
  createdAt: string;
  notes: string | null;
  changes?: Record<string, Change>;
}

/** Per-coupon audit timeline (point 20) — reads audit_events by entity_id = coupon.id. Newest first.
 *  Structured `changes` drive human-readable rendering in the UI. */
export async function listCouponAudit(couponId: string): Promise<CouponAuditEntry[]> {
  const db = loose();
  const { data } = await db.from("audit_events")
    .select("id, event, actor_type, actor_id, created_at, notes, metadata")
    .eq("entity_id", couponId).like("event", "coupon.%")
    .order("created_at", { ascending: false }).limit(100);
  return (data ?? []).map((r: any) => ({
    id: r.id, event: r.event, actorType: r.actor_type ?? null, actorId: r.actor_id ?? null,
    createdAt: r.created_at, notes: r.notes ?? null, changes: r.metadata?.changes,
  }));
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

/** Lifecycle transition (Phase 2 · points 12/19). Pause = temporary stop; Archive = retire; Restore an
 *  archived coupon → DRAFT (forces review before relaunch, never auto-Active). (Activation-readiness
 *  validation is layered on in the validation step.) */
export async function setCouponStatus(id: string, next: "draft" | "active" | "paused" | "archived", actorId?: string) {
  const db = loose();
  if (next === "active") {
    // Activation readiness (point 7): a draft can be incomplete, but it must be VALID to go live.
    const { data: c } = await db.from("coupons").select("*").eq("id", id).maybeSingle();
    if (!c) return { ok: false, reason: "coupon not found" };
    const { data: t } = await db.from("coupon_targets").select("*").eq("coupon_id", id);
    const errs = validateCouponForActivation(rowToConfig(c, t ?? []));
    if (errs.length) return { ok: false, reason: `Can’t activate: ${errs[0]}` };
  }
  const { error } = await db.from("coupons").update({ status: next, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  const event = next === "active" ? "coupon.activated" : next === "paused" ? "coupon.paused"
    : next === "archived" ? "coupon.archived" : "coupon.restored";
  await logEvent({ entityType: "settings", event, entityId: id, actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

/** Destructive delete is allowed ONLY for a genuinely-unused DRAFT: no redemptions, no order references
 *  (by id OR the code snapshot), and never previously activated (per audit). used_count=0 alone is NOT
 *  proof. Anything historically meaningful must be ARCHIVED instead (point 19). */
export async function deleteCoupon(id: string, actorId?: string) {
  const db = loose();
  const { data: c } = await db.from("coupons").select("status, code").eq("id", id).maybeSingle();
  if (!c) return { ok: false, reason: "coupon not found" };
  const archiveInstead = "This coupon has history — archive it instead of deleting.";
  if (c.status !== "draft") return { ok: false, reason: "Only draft coupons can be deleted. Archive this one instead." };
  const some = async (t: string, col: string, val: string, extra?: (q: any) => any) => {
    let q = db.from(t).select("id").eq(col, val).limit(1);
    if (extra) q = extra(q);
    return ((await q).data ?? []).length > 0;
  };
  if (await some("coupon_redemptions", "coupon_id", id)) return { ok: false, reason: archiveInstead };
  if (await some("orders", "coupon_id", id)) return { ok: false, reason: archiveInstead };
  if (await some("orders", "coupon_code", c.code)) return { ok: false, reason: archiveInstead };
  if (await some("audit_events", "entity_id", id, (q) => q.eq("event", "coupon.activated"))) return { ok: false, reason: archiveInstead };
  const { error } = await db.from("coupons").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "coupon.deleted", entityId: id, actorType: actorId ? "staff" : "system", actorId, notes: c.code });
  return { ok: true };
}

/** Duplicate (point 18) — copy the CONFIG (targets/eligibility/limits/descriptions/dates) into a brand-new
 *  coupon identity with a new unique code, forced to DRAFT. Copies NO operational/history state
 *  (used_count/ledger/audit/orders/reservations/creation metadata). Dates are preserved (Draft prevents
 *  accidental execution) — the admin is prompted to review them before activating. */
const DUP_FIELDS = ["public_description", "internal_notes", "description", "type", "value", "max_discount", "min_order",
  "min_qualifying_quantity", "max_uses", "max_uses_per_user", "eligibility", "first_order_only", "auto_apply",
  "combinable", "priority", "exclude_sale", "starts_at", "expires_at"] as const;
export async function duplicateCoupon(sourceId: string, newCode: string, actorId?: string) {
  const clean = normalizeCouponCode(newCode);
  if (!clean) return { ok: false, reason: "a new code is required" };
  const db = loose();
  const { data: src } = await db.from("coupons").select("*").eq("id", sourceId).maybeSingle();
  if (!src) return { ok: false, reason: "source coupon not found" };
  const dup: Record<string, unknown> = { code: clean, status: "draft" }; // new identity, Draft; used_count defaults 0
  for (const f of DUP_FIELDS) dup[f] = src[f];
  const { data: created, error } = await db.from("coupons").insert(dup).select("id").single();
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "code already exists" : error.message };
  const { data: targets } = await db.from("coupon_targets").select("mode, target_type, category_id, collection_id, product_id, variant_id, product_type").eq("coupon_id", sourceId);
  const rows = (targets ?? []).map((t: any) => ({ ...t, coupon_id: created.id }));
  if (rows.length) await db.from("coupon_targets").insert(rows);
  await logEvent({ entityType: "settings", event: "coupon.duplicated", entityId: created.id, actorType: actorId ? "staff" : "system", actorId, notes: `${src.code} → ${clean}`, metadata: { sourceId, newId: created.id, sourceCode: src.code, newCode: clean } });
  return { ok: true, id: created.id };
}
