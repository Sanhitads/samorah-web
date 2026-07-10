/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Product admin service (audit gap: the catalog could only be changed by running a
 * seed script — no way to add/edit a product from the app). Core product fields +
 * variant management (price/stock/active) + publish. Every change is audited. This
 * is v1 (commerce + key editorial fields + variants); the full editorial form
 * (mood tags, long story, images) layers on later.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

export type ProductStatus = "active" | "draft" | "archived" | "out_of_stock";
export type VesselType = "glass" | "ceramic" | "terracotta";

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  baseSku: string;
  status: ProductStatus;
  isFeatured: boolean;
  price: number;
  salePrice: number | null;
  hsnCode: string;
  gstRate: number;
  fragranceFamily: string | null;
  variantCount: number;
  totalStock: number;
}

export async function listProductsAdmin(): Promise<ProductRow[]> {
  const db = loose();
  const { data } = await db.from("products").select("*, variants(stock)").order("name");
  return (data ?? []).map((p: any) => ({
    id: p.id, name: p.name, slug: p.slug, baseSku: p.base_sku, status: p.status, isFeatured: Boolean(p.is_featured),
    price: Number(p.price), salePrice: p.sale_price != null ? Number(p.sale_price) : null,
    hsnCode: p.hsn_code, gstRate: Number(p.gst_rate), fragranceFamily: p.fragrance_family,
    variantCount: (p.variants ?? []).length,
    totalStock: (p.variants ?? []).reduce((s: number, v: any) => s + Number(v.stock ?? 0), 0),
  }));
}

export interface VariantRow {
  id: string; sku: string; variantName: string | null; vesselType: VesselType | null;
  sizeLabel: string | null; price: number; salePrice: number | null; costPrice: number; stock: number; isActive: boolean; sortOrder: number;
}

export async function getProductForEdit(id: string): Promise<{ product: any; variants: VariantRow[] } | null> {
  const db = loose();
  const { data: product } = await db.from("products").select("*").eq("id", id).maybeSingle();
  if (!product) return null;
  const { data: vs } = await db.from("variants").select("*").eq("product_id", id).order("sort_order");
  const variants: VariantRow[] = (vs ?? []).map((v: any) => ({
    id: v.id, sku: v.sku, variantName: v.variant_name, vesselType: v.vessel_type, sizeLabel: v.size_label,
    price: Number(v.price), salePrice: v.sale_price != null ? Number(v.sale_price) : null, costPrice: Number(v.cost_price ?? 0), stock: Number(v.stock ?? 0),
    isActive: Boolean(v.is_active), sortOrder: Number(v.sort_order ?? 0),
  }));
  return { product, variants };
}

export async function getCategoriesForSelect(): Promise<{ id: string; name: string }[]> {
  const db = loose();
  const { data } = await db.from("categories").select("id,name").order("name");
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name }));
}

// ── Product core ─────────────────────────────────────────────────────────────
export interface ProductCoreInput {
  name?: string; slug?: string; tagline?: string; scentGroup?: string; fragranceFamily?: string;
  story?: string; burnTime?: string; price?: number; salePrice?: number | null; hsnCode?: string; gstRate?: number;
  weightGrams?: number | null; status?: ProductStatus; isFeatured?: boolean;
}
function productRow(i: ProductCoreInput): Record<string, unknown> {
  const r: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (i.name !== undefined) r.name = i.name.trim();
  if (i.slug !== undefined) r.slug = i.slug.trim();
  if (i.tagline !== undefined) r.tagline = i.tagline || null;
  if (i.scentGroup !== undefined) r.scent_group = i.scentGroup || null;
  if (i.fragranceFamily !== undefined) r.fragrance_family = i.fragranceFamily || null;
  if (i.story !== undefined) r.story = i.story || null;
  if (i.burnTime !== undefined) r.burn_time = i.burnTime || null;
  if (i.price !== undefined) r.price = i.price;
  if (i.salePrice !== undefined) r.sale_price = i.salePrice;
  if (i.hsnCode !== undefined) r.hsn_code = i.hsnCode;
  if (i.gstRate !== undefined) r.gst_rate = i.gstRate;
  if (i.weightGrams !== undefined) r.weight_grams = i.weightGrams;
  if (i.status !== undefined) r.status = i.status;
  if (i.isFeatured !== undefined) r.is_featured = i.isFeatured;
  return r;
}

export async function updateProduct(id: string, input: ProductCoreInput, actorId?: string) {
  const db = loose();
  const { error } = await db.from("products").update(productRow(input)).eq("id", id);
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "slug already exists" : error.message };
  await logEvent({ entityType: "product", entityId: id, event: "product.updated", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true };
}

export async function setProductStatus(id: string, status: ProductStatus, actorId?: string) {
  const db = loose();
  const { error } = await db.from("products").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "product", entityId: id, event: `product.${status}`, actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export async function setProductFeatured(id: string, isFeatured: boolean, actorId?: string) {
  const db = loose();
  const { error } = await db.from("products").update({ is_featured: isFeatured, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "product", entityId: id, event: isFeatured ? "product.featured" : "product.unfeatured", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export interface CreateProductInput {
  name: string; slug: string; baseSku: string; categoryId: string; price: number; hsnCode: string; gstRate: number;
  fragranceFamily?: string; tagline?: string;
}
export async function createProduct(input: CreateProductInput, actorId?: string) {
  if (!input.name?.trim() || !input.slug?.trim() || !input.baseSku?.trim()) return { ok: false, reason: "name, slug and base SKU are required" };
  if (!input.categoryId) return { ok: false, reason: "category is required" };
  const db = loose();
  const { data, error } = await db.from("products").insert({
    name: input.name.trim(), slug: input.slug.trim(), base_sku: input.baseSku.trim().toUpperCase(),
    category_id: input.categoryId, price: input.price, hsn_code: input.hsnCode, gst_rate: input.gstRate,
    fragrance_family: input.fragranceFamily || null, tagline: input.tagline || null, status: "draft",
  }).select("id").single();
  if (error || !data) return { ok: false, reason: /duplicate|unique/i.test(error?.message ?? "") ? "slug or SKU already exists" : error?.message ?? "insert failed" };
  await logEvent({ entityType: "product", entityId: data.id, event: "product.created", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true, id: data.id };
}

// ── Variants ─────────────────────────────────────────────────────────────────
export interface VariantInput {
  id?: string; productId: string; sku: string; variantName?: string; vesselType?: VesselType | null;
  sizeLabel?: string; price: number; salePrice?: number | null; costPrice?: number; stock?: number; isActive?: boolean; sortOrder?: number;
}
export async function upsertVariant(input: VariantInput, actorId?: string) {
  if (!input.sku?.trim()) return { ok: false, reason: "SKU required" };
  const db = loose();
  const row = {
    product_id: input.productId, sku: input.sku.trim().toUpperCase(), variant_name: input.variantName || null,
    vessel_type: input.vesselType || null, size_label: input.sizeLabel || null, price: input.price,
    sale_price: input.salePrice ?? null, cost_price: input.costPrice ?? 0, stock: input.stock ?? 0, is_active: input.isActive ?? true,
    sort_order: input.sortOrder ?? 0, updated_at: new Date().toISOString(),
  };
  const { error } = input.id
    ? await db.from("variants").update(row).eq("id", input.id)
    : await db.from("variants").insert(row);
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "SKU already exists" : error.message };
  await logEvent({ entityType: "product", entityId: input.productId, event: input.id ? "variant.updated" : "variant.created", actorType: actorId ? "staff" : "system", actorId, notes: input.sku });
  return { ok: true };
}
export async function deleteVariant(id: string, productId: string, actorId?: string) {
  const db = loose();
  const { error } = await db.from("variants").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "product", entityId: productId, event: "variant.deleted", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}
