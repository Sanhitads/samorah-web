/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Category admin service (Batch B · point 10 — Category CMS). Categories are the catalog taxonomy
 * that seeds a product's SKU prefix + HSN + GST defaults (used by the New-product form and the SKU
 * builder). They were creatable only via the seed script; this exposes list / create / edit / reorder
 * / activate / delete from the app. Every change is audited. The table is FLAT (no parent_id) — a
 * nested hierarchy is a schema change tracked in the roadmap. Deletion is BLOCKED while products
 * reference the category (the FK is `on delete restrict`), so a live product can never be orphaned.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

export const GST_RATES = [0, 5, 12, 18, 28] as const;

export interface CategoryRow {
  id: string; name: string; slug: string; description: string | null;
  skuPrefix: string; defaultHsnCode: string; defaultGstRate: number;
  sortOrder: number; isActive: boolean; productCount: number; createdAt: string;
}

function mapRow(c: any, productCount: number): CategoryRow {
  return {
    id: c.id, name: c.name, slug: c.slug, description: c.description ?? null,
    skuPrefix: c.sku_prefix ?? "", defaultHsnCode: c.default_hsn_code ?? "", defaultGstRate: Number(c.default_gst_rate ?? 12),
    sortOrder: Number(c.sort_order ?? 0), isActive: Boolean(c.is_active), productCount, createdAt: c.created_at,
  };
}

/** Categories with product counts, ordered by sort_order then name. */
export async function listCategoriesAdmin(): Promise<CategoryRow[]> {
  const db = loose();
  const { data } = await db.from("categories").select("*").order("sort_order").order("name");
  // Product counts — one read, tallied in-process (the catalogue is small).
  const counts = new Map<string, number>();
  try {
    const { data: prods } = await db.from("products").select("category_id");
    for (const p of prods ?? []) if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  } catch { /* products optional */ }
  return (data ?? []).map((c: any) => mapRow(c, counts.get(c.id) ?? 0));
}

export interface CategoryInput {
  name: string; slug: string; description?: string;
  skuPrefix: string; defaultHsnCode: string; defaultGstRate: number; isActive?: boolean;
}

function toRow(i: CategoryInput): Record<string, unknown> {
  return {
    name: i.name.trim(), slug: i.slug.trim().toLowerCase(), description: i.description?.trim() || null,
    sku_prefix: i.skuPrefix.trim().toUpperCase(), default_hsn_code: i.defaultHsnCode.trim(),
    default_gst_rate: GST_RATES.includes(i.defaultGstRate as any) ? i.defaultGstRate : 12,
    is_active: i.isActive ?? true, updated_at: new Date().toISOString(),
  };
}

export async function createCategory(input: CategoryInput, actorId?: string) {
  if (!input.name?.trim() || !input.slug?.trim() || !input.skuPrefix?.trim() || !input.defaultHsnCode?.trim()) {
    return { ok: false, reason: "Name, slug, SKU prefix and HSN are required." };
  }
  const db = loose();
  // New categories sort to the end.
  const { data: max } = await db.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const row = { ...toRow(input), sort_order: (Number(max?.sort_order ?? 0) + 1) };
  const { data, error } = await db.from("categories").insert(row).select("id").maybeSingle();
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "A category with that slug already exists." : error.message };
  await logEvent({ entityType: "settings", entityId: data?.id, event: "category.created", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true, id: data?.id };
}

export async function updateCategory(id: string, input: CategoryInput, actorId?: string) {
  if (!input.name?.trim() || !input.slug?.trim() || !input.skuPrefix?.trim() || !input.defaultHsnCode?.trim()) {
    return { ok: false, reason: "Name, slug, SKU prefix and HSN are required." };
  }
  const db = loose();
  const { error } = await db.from("categories").update(toRow(input)).eq("id", id);
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "A category with that slug already exists." : error.message };
  await logEvent({ entityType: "settings", entityId: id, event: "category.updated", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true };
}

export async function setCategoryStatus(id: string, isActive: boolean, actorId?: string) {
  const db = loose();
  const { error } = await db.from("categories").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", entityId: id, event: isActive ? "category.activated" : "category.deactivated", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

/** Move a category one step up/down in the sort order (swaps sort_order with its neighbour). */
export async function reorderCategory(id: string, direction: "up" | "down", actorId?: string) {
  const db = loose();
  const { data: all } = await db.from("categories").select("id,sort_order").order("sort_order").order("name");
  const rows = (all ?? []) as { id: string; sort_order: number }[];
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return { ok: false, reason: "not found" };
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return { ok: true }; // already at the edge — no-op
  const a = rows[i], b = rows[j];
  // Normalise to positions so swaps are stable even if legacy sort_orders collide.
  await db.from("categories").update({ sort_order: b.sort_order, updated_at: new Date().toISOString() }).eq("id", a.id);
  await db.from("categories").update({ sort_order: a.sort_order, updated_at: new Date().toISOString() }).eq("id", b.id);
  await logEvent({ entityType: "settings", entityId: id, event: "category.reordered", actorType: actorId ? "staff" : "system", actorId, notes: direction });
  return { ok: true };
}

/** Delete a category — BLOCKED while any product references it (FK is restrict; we surface a clear reason). */
export async function deleteCategory(id: string, actorId?: string) {
  const db = loose();
  const { data: used } = await db.from("products").select("id").eq("category_id", id).limit(1);
  if ((used ?? []).length) return { ok: false, reason: "In use by one or more products — reassign them first." };
  const { error } = await db.from("categories").delete().eq("id", id);
  if (error) return { ok: false, reason: /foreign key|violates/i.test(error.message) ? "In use by one or more products — reassign them first." : error.message };
  await logEvent({ entityType: "settings", entityId: id, event: "category.deleted", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}
