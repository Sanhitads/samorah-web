/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Packaging service (build #6) — CRUD over the four packaging things (Assets ·
 * Profiles+Items · Rules · Inventory) AND the live catalog loader that lets the
 * managed data actually drive packing. Until now the engine read the config
 * EXAMPLE_PACKAGING_CATALOG; `getPackagingCatalog()` reads the DB so real
 * measurements entered here flow into every shipment (with the config as a fallback
 * while the tables are empty). Every change is audited.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { EXAMPLE_PACKAGING_CATALOG } from "@/config/packaging";
import { assetsNeedingReorder, isLowStock } from "@/lib/packaging/inventory";
import type { PackagingAsset, PackagingProfile, PackagingRule, PackagingCatalog, PackagingAssetType } from "@/lib/packaging/types";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

// ── row mappers ──────────────────────────────────────────────────────────────
function mapAsset(r: any): PackagingAsset {
  return {
    id: r.id, name: r.name, type: r.type as PackagingAssetType,
    lengthCm: r.length_cm != null ? Number(r.length_cm) : undefined,
    widthCm: r.width_cm != null ? Number(r.width_cm) : undefined,
    heightCm: r.height_cm != null ? Number(r.height_cm) : undefined,
    weightG: Number(r.weight_g ?? 0),
    maxWeightG: r.max_weight_g != null ? Number(r.max_weight_g) : undefined,
    maxProducts: r.max_products != null ? Number(r.max_products) : undefined,
    fragile: Boolean(r.fragile), costInr: r.cost != null ? Number(r.cost) : undefined,
    vendor: r.vendor ?? undefined, barcode: r.barcode ?? undefined, active: Boolean(r.active),
    currentStock: Number(r.current_stock ?? 0), minStock: Number(r.min_stock ?? 0), reorderLevel: Number(r.reorder_level ?? 0),
  };
}
function mapRule(r: any): PackagingRule {
  return {
    id: r.id, name: r.name, kind: r.kind, priority: Number(r.priority ?? 100), active: Boolean(r.active),
    minProducts: r.min_products ?? undefined, maxProducts: r.max_products ?? undefined,
    productType: r.product_type ?? undefined, vessel: r.vessel ?? undefined,
    isGift: r.is_gift ?? undefined, profileId: r.profile_id ?? undefined,
    addFragileWrap: Boolean(r.add_fragile_wrap), addLeakSeal: Boolean(r.add_leak_seal),
  };
}

async function loadAssets(activeOnly = false): Promise<PackagingAsset[]> {
  const db = loose();
  let q = db.from("packaging_assets").select("*").order("type");
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []).map(mapAsset);
}
async function loadProfiles(activeOnly = false): Promise<PackagingProfile[]> {
  const db = loose();
  let q = db.from("packaging_profiles").select("*, packaging_profile_items(asset_id,quantity,role)").order("name");
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, description: r.description ?? undefined, active: Boolean(r.active),
    items: (r.packaging_profile_items ?? []).map((it: any) => ({ assetId: it.asset_id, quantity: Number(it.quantity ?? 1), role: it.role })),
  }));
}
async function loadRules(activeOnly = false): Promise<PackagingRule[]> {
  const db = loose();
  let q = db.from("packaging_rules").select("*").order("priority");
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []).map(mapRule);
}

/**
 * The live catalog the engine packs against. Falls back to the config example while
 * the DB has no assets/profiles, so packing never breaks pre-seed.
 */
export async function getPackagingCatalog(): Promise<PackagingCatalog> {
  try {
    const [assets, profiles, rules] = await Promise.all([loadAssets(true), loadProfiles(true), loadRules(true)]);
    if (!assets.length || !profiles.length) return EXAMPLE_PACKAGING_CATALOG;
    return { assets, profiles, rules, defaultProfileId: profiles[0].id };
  } catch {
    return EXAMPLE_PACKAGING_CATALOG;
  }
}

// ── admin read view ──────────────────────────────────────────────────────────
export interface PackagingAdminView {
  assets: PackagingAsset[];
  profiles: PackagingProfile[];
  rules: PackagingRule[];
  reorderCount: number;
  usingDbCatalog: boolean;
}
export async function getPackagingAdminView(): Promise<PackagingAdminView> {
  const [assets, profiles, rules] = await Promise.all([loadAssets(), loadProfiles(), loadRules()]);
  const activeAssets = assets.filter((a) => a.active);
  return {
    assets,
    profiles,
    rules,
    reorderCount: assetsNeedingReorder(activeAssets).length,
    usingDbCatalog: activeAssets.length > 0 && profiles.some((p) => p.active),
  };
}

/** Assets at/below reorder level (Dashboard KPI + inventory alerts). */
export async function getReorderList(): Promise<{ id: string; name: string; currentStock: number; reorderLevel: number; low: boolean }[]> {
  const assets = (await loadAssets(true));
  return assetsNeedingReorder(assets).map((a) => ({
    id: a.id, name: a.name, currentStock: a.currentStock ?? 0, reorderLevel: a.reorderLevel ?? 0, low: isLowStock({ currentStock: a.currentStock, minStock: a.minStock }),
  }));
}

// ── Asset CRUD + stock ───────────────────────────────────────────────────────
export interface AssetInput {
  name: string; type: PackagingAssetType;
  lengthCm?: number; widthCm?: number; heightCm?: number; weightG?: number;
  maxWeightG?: number; maxProducts?: number; fragile?: boolean; costInr?: number;
  vendor?: string; barcode?: string; active?: boolean;
  currentStock?: number; minStock?: number; reorderLevel?: number;
}
function assetRow(i: AssetInput): Record<string, unknown> {
  return {
    name: i.name?.trim(), type: i.type,
    length_cm: i.lengthCm ?? null, width_cm: i.widthCm ?? null, height_cm: i.heightCm ?? null,
    weight_g: i.weightG ?? 0, max_weight_g: i.maxWeightG ?? null, max_products: i.maxProducts ?? null,
    fragile: i.fragile ?? false, cost: i.costInr ?? null, vendor: i.vendor ?? null, barcode: i.barcode ?? null,
    active: i.active ?? true, current_stock: i.currentStock ?? 0, min_stock: i.minStock ?? 0, reorder_level: i.reorderLevel ?? 0,
  };
}

export async function createAsset(input: AssetInput, actorId?: string) {
  if (!input.name?.trim()) return { ok: false, reason: "name required" };
  const db = loose();
  const { data, error } = await db.from("packaging_assets").insert(assetRow(input)).select("id").single();
  if (error || !data) return { ok: false, reason: error?.message ?? "insert failed" };
  await logEvent({ entityType: "settings", event: "packaging.asset_created", actorType: actorId ? "staff" : "system", actorId, notes: input.name, metadata: { type: input.type } });
  return { ok: true, id: data.id };
}
export async function updateAsset(id: string, input: AssetInput, actorId?: string) {
  const db = loose();
  const { error } = await db.from("packaging_assets").update({ ...assetRow(input), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "packaging.asset_updated", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true };
}
export async function deleteAsset(id: string, actorId?: string) {
  const db = loose();
  const { error } = await db.from("packaging_assets").delete().eq("id", id);
  // FK restrict: an asset used by a profile can't be deleted — surface that cleanly.
  if (error) return { ok: false, reason: /foreign key|violates/i.test(error.message) ? "in use by a profile" : error.message };
  await logEvent({ entityType: "settings", event: "packaging.asset_deleted", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}
/** Receive/consume stock. delta > 0 receives, < 0 consumes; clamps at 0. */
export async function adjustStock(id: string, delta: number, reason: string | undefined, actorId?: string) {
  const db = loose();
  const { data: a } = await db.from("packaging_assets").select("current_stock,name").eq("id", id).maybeSingle();
  if (!a) return { ok: false, reason: "asset not found" };
  const next = Math.max(0, Number(a.current_stock ?? 0) + delta);
  const { error } = await db.from("packaging_assets").update({ current_stock: next, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "packaging.stock_adjusted", actorType: actorId ? "staff" : "system", actorId, notes: `${a.name}: ${delta > 0 ? "+" : ""}${delta}${reason ? ` (${reason})` : ""}`, metadata: { from: Number(a.current_stock ?? 0), to: next } });
  return { ok: true, currentStock: next };
}

// ── Profile CRUD ─────────────────────────────────────────────────────────────
export interface ProfileInput { name: string; description?: string; active?: boolean; items: { assetId: string; quantity: number; role: string }[]; }
export async function createProfile(input: ProfileInput, actorId?: string) {
  if (!input.name?.trim()) return { ok: false, reason: "name required" };
  const db = loose();
  const { data, error } = await db.from("packaging_profiles").insert({ name: input.name.trim(), description: input.description ?? null, active: input.active ?? true }).select("id").single();
  if (error || !data) return { ok: false, reason: error?.message ?? "insert failed" };
  await setProfileItems(data.id, input.items);
  await logEvent({ entityType: "settings", event: "packaging.profile_created", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true, id: data.id };
}
export async function updateProfile(id: string, input: ProfileInput, actorId?: string) {
  const db = loose();
  const { error } = await db.from("packaging_profiles").update({ name: input.name.trim(), description: input.description ?? null, active: input.active ?? true, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await setProfileItems(id, input.items);
  await logEvent({ entityType: "settings", event: "packaging.profile_updated", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true };
}
async function setProfileItems(profileId: string, items: { assetId: string; quantity: number; role: string }[]) {
  const db = loose();
  await db.from("packaging_profile_items").delete().eq("profile_id", profileId);
  const clean = (items ?? []).filter((it) => it.assetId && it.quantity > 0);
  if (clean.length) await db.from("packaging_profile_items").insert(clean.map((it) => ({ profile_id: profileId, asset_id: it.assetId, quantity: it.quantity, role: it.role })));
}
export async function deleteProfile(id: string, actorId?: string) {
  const db = loose();
  const { error } = await db.from("packaging_profiles").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "packaging.profile_deleted", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

// ── Rule CRUD ────────────────────────────────────────────────────────────────
export interface PkgRuleInput {
  name: string; kind: "select" | "modifier"; priority?: number; active?: boolean;
  minProducts?: number; maxProducts?: number; productType?: string; vessel?: string; isGift?: boolean;
  profileId?: string; addFragileWrap?: boolean; addLeakSeal?: boolean;
}
function ruleRow(i: PkgRuleInput): Record<string, unknown> {
  return {
    name: i.name?.trim(), kind: i.kind, priority: i.priority ?? 100, active: i.active ?? true,
    min_products: i.minProducts ?? null, max_products: i.maxProducts ?? null,
    product_type: i.productType || null, vessel: i.vessel || null, is_gift: i.isGift ?? null,
    profile_id: i.profileId || null, add_fragile_wrap: i.addFragileWrap ?? false, add_leak_seal: i.addLeakSeal ?? false,
  };
}
export async function createPkgRule(input: PkgRuleInput, actorId?: string) {
  if (!input.name?.trim()) return { ok: false, reason: "name required" };
  const db = loose();
  const { data, error } = await db.from("packaging_rules").insert(ruleRow(input)).select("id").single();
  if (error || !data) return { ok: false, reason: error?.message ?? "insert failed" };
  await logEvent({ entityType: "settings", event: "packaging.rule_created", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true, id: data.id };
}
export async function updatePkgRule(id: string, input: PkgRuleInput, actorId?: string) {
  const db = loose();
  const { error } = await db.from("packaging_rules").update(ruleRow(input)).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "packaging.rule_updated", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true };
}
export async function togglePkgRule(id: string, active: boolean, actorId?: string) {
  const db = loose();
  const { error } = await db.from("packaging_rules").update({ active }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: active ? "packaging.rule_activated" : "packaging.rule_deactivated", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}
export async function deletePkgRule(id: string, actorId?: string) {
  const db = loose();
  const { error } = await db.from("packaging_rules").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "packaging.rule_deleted", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}
