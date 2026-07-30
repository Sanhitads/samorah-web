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

const LOW_STOCK = 10;

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  baseSku: string;
  status: ProductStatus;
  isFeatured: boolean;
  isHero: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;
  price: number;
  salePrice: number | null;
  hsnCode: string;
  gstRate: number;
  fragranceFamily: string | null;
  scentGroup: string | null;
  collectionName: string | null;
  imageUrl: string | null;
  variantCount: number;
  totalStock: number;
  lowStock: boolean;
  salesCount: number;
  salesRevenue: number;
  updatedAt: string | null;
}

/** Rich product list for the CMS board — collection, primary image, aggregate stock + sales, and the
 *  merchandising flags. Sales are summed from paid order lines (one aggregate query). Filtering /
 *  sorting / analytics run client-side over this (the catalogue is small). */
export async function listProductsAdmin(): Promise<ProductRow[]> {
  const db = loose();
  const { data } = await db.from("products").select("*, variants(stock), collections!collection_id(name), product_images(url,is_primary,sort_order)").order("name");

  // Units sold + revenue per product (paid orders) — one query, aggregated in-process.
  const sales = new Map<string, number>();
  const revenue = new Map<string, number>();
  try {
    const { data: lines } = await db.from("order_items").select("product_id,quantity,line_total,orders!inner(payment_status)").in("orders.payment_status", ["paid", "partially_refunded", "refunded"]);
    for (const l of lines ?? []) if (l.product_id) {
      sales.set(l.product_id, (sales.get(l.product_id) ?? 0) + Number(l.quantity ?? 0));
      revenue.set(l.product_id, (revenue.get(l.product_id) ?? 0) + Number(l.line_total ?? 0));
    }
  } catch { /* order_items optional */ }

  return (data ?? []).map((p: any) => {
    const imgs = (p.product_images ?? []) as any[];
    const primary = imgs.find((i) => i.is_primary) ?? [...imgs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    const totalStock = (p.variants ?? []).reduce((s: number, v: any) => s + Number(v.stock ?? 0), 0);
    const col = Array.isArray(p.collections) ? p.collections[0] : p.collections;
    return {
      id: p.id, name: p.name, slug: p.slug, baseSku: p.base_sku, status: p.status,
      isFeatured: Boolean(p.is_featured), isHero: Boolean(p.is_hero), isBestseller: Boolean(p.is_bestseller), isNewArrival: Boolean(p.is_new_arrival),
      price: Number(p.price), salePrice: p.sale_price != null ? Number(p.sale_price) : null,
      hsnCode: p.hsn_code, gstRate: Number(p.gst_rate), fragranceFamily: p.fragrance_family, scentGroup: p.scent_group,
      collectionName: col?.name ?? null, imageUrl: primary?.url ?? null,
      variantCount: (p.variants ?? []).length, totalStock, lowStock: totalStock > 0 && totalStock < LOW_STOCK,
      salesCount: sales.get(p.id) ?? 0, salesRevenue: Math.round(revenue.get(p.id) ?? 0), updatedAt: p.updated_at ?? null,
    };
  });
}

export interface VariantRow {
  id: string; sku: string; variantName: string | null; vesselType: VesselType | null;
  sizeLabel: string | null; price: number; salePrice: number | null; costPrice: number; stock: number; isActive: boolean; sortOrder: number;
  barcode: string | null; weightGrams: number | null; lowStockThreshold: number | null;
  // Batch C — operational logistics / procurement fields (20260805120000).
  shippingClass: string | null; packageLengthCm: number | null; packageWidthCm: number | null; packageHeightCm: number | null; supplierSku: string | null;
}

export interface NoteRow { id: string; layer: string; note: string; sortOrder: number; }
export interface ImageRow { id: string; url: string; altText: string | null; isPrimary: boolean; sortOrder: number; }

export async function getProductForEdit(id: string): Promise<{ product: any; variants: VariantRow[]; notes: NoteRow[]; images: ImageRow[] } | null> {
  const db = loose();
  const { data: product } = await db.from("products").select("*").eq("id", id).maybeSingle();
  if (!product) return null;
  const [{ data: vs }, { data: ns }, { data: imgs }] = await Promise.all([
    db.from("variants").select("*").eq("product_id", id).order("sort_order"),
    db.from("fragrance_notes").select("*").eq("product_id", id).order("sort_order"),
    db.from("product_images").select("*").eq("product_id", id).order("sort_order"),
  ]);
  const variants: VariantRow[] = (vs ?? []).map((v: any) => ({
    id: v.id, sku: v.sku, variantName: v.variant_name, vesselType: v.vessel_type, sizeLabel: v.size_label,
    price: Number(v.price), salePrice: v.sale_price != null ? Number(v.sale_price) : null, costPrice: Number(v.cost_price ?? 0), stock: Number(v.stock ?? 0),
    isActive: Boolean(v.is_active), sortOrder: Number(v.sort_order ?? 0),
    barcode: v.barcode ?? null, weightGrams: v.weight_grams != null ? Number(v.weight_grams) : null, lowStockThreshold: v.low_stock_threshold != null ? Number(v.low_stock_threshold) : null,
    shippingClass: v.shipping_class ?? null,
    packageLengthCm: v.package_length_cm != null ? Number(v.package_length_cm) : null, packageWidthCm: v.package_width_cm != null ? Number(v.package_width_cm) : null, packageHeightCm: v.package_height_cm != null ? Number(v.package_height_cm) : null,
    supplierSku: v.supplier_sku ?? null,
  }));
  const notes: NoteRow[] = (ns ?? []).map((n: any) => ({ id: n.id, layer: n.layer, note: n.note, sortOrder: Number(n.sort_order ?? 0) }));
  const images: ImageRow[] = (imgs ?? []).map((im: any) => ({ id: im.id, url: im.url, altText: im.alt_text ?? null, isPrimary: Boolean(im.is_primary), sortOrder: Number(im.sort_order ?? 0) }));
  return { product, variants, notes, images };
}

export async function getCategoriesForSelect(): Promise<{ id: string; name: string }[]> {
  const db = loose();
  const { data } = await db.from("categories").select("id,name").order("name");
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name }));
}

export async function getCollectionsForSelect(): Promise<{ id: string; name: string; volume: string | null; slug: string }[]> {
  const db = loose();
  const { data } = await db.from("collections").select("id,name,volume,slug").order("sort_order");
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, volume: c.volume ?? null, slug: c.slug ?? "" }));
}

// ── Fragrance journey (fragrance_notes) — replace-all, the editor edits the full set ─────────────
export async function setFragranceNotes(productId: string, notes: { layer: string; note: string; sortOrder: number }[], actorId?: string) {
  const db = loose();
  await db.from("fragrance_notes").delete().eq("product_id", productId);
  const rows = notes.filter((n) => n.note.trim()).map((n) => ({ product_id: productId, layer: n.layer, note: n.note.trim(), sort_order: n.sortOrder }));
  if (rows.length) { const { error } = await db.from("fragrance_notes").insert(rows); if (error) return { ok: false, reason: error.message }; }
  await logEvent({ entityType: "product", entityId: productId, event: "product.notes_set", actorType: actorId ? "staff" : "system", actorId, notes: `${rows.length} notes` });
  return { ok: true };
}

// ── Product images ───────────────────────────────────────────────────────────────────────────────
export async function addProductImage(productId: string, url: string, altText: string, actorId?: string) {
  if (!url.trim()) return { ok: false, reason: "url required" };
  const db = loose();
  const { data: existing } = await db.from("product_images").select("id,sort_order").eq("product_id", productId);
  const maxSort = (existing ?? []).reduce((m: number, i: any) => Math.max(m, Number(i.sort_order ?? 0)), -1);
  const isFirst = !(existing ?? []).length;
  const { error } = await db.from("product_images").insert({ product_id: productId, url: url.trim(), alt_text: altText.trim(), is_primary: isFirst, sort_order: maxSort + 1 });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "product", entityId: productId, event: "product.image_added", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}
export async function updateProductImage(id: string, patch: { altText?: string; sortOrder?: number }, actorId?: string) {
  const db = loose();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.altText !== undefined) row.alt_text = patch.altText.trim();
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  const { error } = await db.from("product_images").update(row).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
export async function setPrimaryImage(productId: string, id: string, actorId?: string) {
  const db = loose();
  await db.from("product_images").update({ is_primary: false }).eq("product_id", productId);
  const { error } = await db.from("product_images").update({ is_primary: true }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "product", entityId: productId, event: "product.hero_image_set", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}
export async function deleteProductImage(id: string, productId: string, actorId?: string) {
  const db = loose();
  const { error } = await db.from("product_images").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "product", entityId: productId, event: "product.image_removed", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

// ── Product core ─────────────────────────────────────────────────────────────
export interface ProductCoreInput {
  name?: string; slug?: string; tagline?: string; scentGroup?: string; fragranceFamily?: string;
  story?: string; burnTime?: string; price?: number; salePrice?: number | null; hsnCode?: string; gstRate?: number;
  weightGrams?: number | null; status?: ProductStatus; isFeatured?: boolean; productType?: string; categoryId?: string;
  // Editorial content (existing columns the storefront already reads)
  collectionId?: string | null; storyLong?: string; flamePersona?: string; moodTags?: string[];
  lifestyleUse?: string; culturalReference?: string; waxBlend?: string; wick?: string;
  seoTitle?: string; seoDescription?: string; seoOgImage?: string; seoCanonical?: string;
  isHero?: boolean; allowBackorder?: boolean; publishAt?: string | null;
  chapterPosition?: string; displayOrder?: number;
  // Artist section (per-product; PDP falls back to the house artist)
  artistEnabled?: boolean; artistName?: string; artistRole?: string; artistStory?: string; artistQuote?: string; artistImage?: string;
  // Air-product PDP content (room / linen fresheners)
  airContent?: Record<string, unknown> | null;
  // Candle-PDP CMS extras (custom palette/gradient, section headings, accordion, custom sections, images, testimonials)
  pdpContent?: Record<string, unknown> | null;
  // Merchandising flags (added by 20260730120000_product_cms)
  isBestseller?: boolean; isNewArrival?: boolean; isLimitedEdition?: boolean; isSeasonal?: boolean; isStaffPick?: boolean; isComingSoon?: boolean;
  // Visibility controls
  visibleWebsite?: boolean; visibleSearch?: boolean; visibleHomepage?: boolean; visibleChapter?: boolean; visibleBundles?: boolean;
}
function productRow(i: ProductCoreInput): Record<string, unknown> {
  const r: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const s = (k: string, v: string | undefined) => { if (v !== undefined) r[k] = v || null; };
  const b = (k: string, v: boolean | undefined) => { if (v !== undefined) r[k] = v; };
  if (i.name !== undefined) r.name = i.name.trim();
  if (i.slug !== undefined) r.slug = i.slug.trim();
  if (i.productType !== undefined) r.product_type = i.productType || "candle";
  s("tagline", i.tagline); s("scent_group", i.scentGroup); s("fragrance_family", i.fragranceFamily);
  s("story", i.story); s("story_long", i.storyLong); s("burn_time", i.burnTime);
  s("flame_persona", i.flamePersona); s("lifestyle_use", i.lifestyleUse); s("cultural_reference", i.culturalReference);
  s("wax_blend", i.waxBlend); s("wick", i.wick);
  s("seo_title", i.seoTitle); s("seo_description", i.seoDescription); s("seo_og_image", i.seoOgImage); s("seo_canonical", i.seoCanonical);
  s("chapter_position", i.chapterPosition);
  s("artist_name", i.artistName); s("artist_role", i.artistRole); s("artist_story", i.artistStory); s("artist_quote", i.artistQuote); s("artist_image", i.artistImage);
  b("artist_enabled", i.artistEnabled);
  if (i.airContent !== undefined) r.air_content = i.airContent;
  if (i.pdpContent !== undefined) r.pdp_content = i.pdpContent;
  if (i.moodTags !== undefined) r.mood_tags = i.moodTags.map((t) => t.trim()).filter(Boolean);
  if (i.collectionId !== undefined) r.collection_id = i.collectionId || null;
  if (i.categoryId !== undefined && i.categoryId) r.category_id = i.categoryId;
  if (i.price !== undefined) r.price = i.price;
  if (i.salePrice !== undefined) r.sale_price = i.salePrice;
  if (i.hsnCode !== undefined) r.hsn_code = i.hsnCode;
  if (i.gstRate !== undefined) r.gst_rate = i.gstRate;
  if (i.weightGrams !== undefined) r.weight_grams = i.weightGrams;
  if (i.displayOrder !== undefined) r.display_order = i.displayOrder;
  if (i.publishAt !== undefined) r.publish_at = i.publishAt || null;
  if (i.status !== undefined) r.status = i.status;
  b("is_featured", i.isFeatured); b("is_hero", i.isHero); b("allow_backorder", i.allowBackorder);
  b("is_bestseller", i.isBestseller); b("is_new_arrival", i.isNewArrival); b("is_limited_edition", i.isLimitedEdition);
  b("is_seasonal", i.isSeasonal); b("is_staff_pick", i.isStaffPick); b("is_coming_soon", i.isComingSoon);
  b("visible_website", i.visibleWebsite); b("visible_search", i.visibleSearch); b("visible_homepage", i.visibleHomepage);
  b("visible_chapter", i.visibleChapter); b("visible_bundles", i.visibleBundles);
  return r;
}

// Columns added by 20260730120000_product_cms — stripped on retry if the migration isn't applied yet,
// so a save never hard-fails before the migration (the existing editorial columns still persist).
const CMS_COLUMNS = [
  "is_bestseller", "is_new_arrival", "is_limited_edition", "is_seasonal", "is_staff_pick", "is_coming_soon",
  "visible_website", "visible_search", "visible_homepage", "visible_chapter", "visible_bundles",
  "chapter_position", "display_order", "seo_og_image", "seo_canonical", "product_type",
  "artist_enabled", "artist_name", "artist_role", "artist_story", "artist_quote", "artist_image", "air_content",
  "pdp_content",
];

export async function updateProduct(id: string, input: ProductCoreInput, actorId?: string) {
  const db = loose();
  const row = productRow(input);
  let { error } = await db.from("products").update(row).eq("id", id);
  // If the CMS migration isn't applied, retry without the new columns rather than fail the whole save.
  if (error && /could not find|does not exist|schema cache|PGRST204/i.test(error.message)) {
    const safe = { ...row };
    for (const c of CMS_COLUMNS) delete safe[c];
    ({ error } = await db.from("products").update(safe).eq("id", id));
  }
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

/** Permanently delete a product — guarded: never delete one with order history (archive it instead).
 *  Removes its variants, images and fragrance notes first so no orphans remain. */
export async function deleteProduct(id: string, actorId?: string) {
  const db = loose();
  const { data: sold } = await db.from("order_items").select("id").eq("product_id", id).limit(1);
  if ((sold ?? []).length) return { ok: false, reason: "This product has order history — set it to Archived instead of deleting." };
  await db.from("fragrance_notes").delete().eq("product_id", id);
  await db.from("product_images").delete().eq("product_id", id);
  await db.from("variants").delete().eq("product_id", id);
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "product", entityId: id, event: "product.deleted", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export async function setProductFeatured(id: string, isFeatured: boolean, actorId?: string) {
  const db = loose();
  const { error } = await db.from("products").update({ is_featured: isFeatured, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "product", entityId: id, event: isFeatured ? "product.featured" : "product.unfeatured", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

/** Duplicate a product (review 19/24) — copies core fields, fragrance notes, images, and variants
 *  (fresh SKUs, zero stock) into a new draft. Luxury brands reuse product templates constantly. */
export async function duplicateProduct(id: string, actorId?: string) {
  const db = loose();
  const { data: p } = await db.from("products").select("*").eq("id", id).maybeSingle();
  if (!p) return { ok: false, reason: "product_not_found" };
  const stamp = Date.now().toString(36).slice(-4);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _oldId, created_at, updated_at, ...rest } = p;
  const copy = { ...rest, name: `${p.name} Copy`, slug: `${p.slug}-copy-${stamp}`, base_sku: `${p.base_sku}-C${stamp}`, status: "draft", is_featured: false, is_hero: false };
  const { data: newP, error } = await db.from("products").insert(copy).select("id").single();
  if (error || !newP) return { ok: false, reason: /duplicate|unique/i.test(error?.message ?? "") ? "slug/SKU collision — try again" : error?.message ?? "insert failed" };
  const [{ data: notes }, { data: vs }, { data: imgs }] = await Promise.all([
    db.from("fragrance_notes").select("layer,note,sort_order").eq("product_id", id),
    db.from("variants").select("*").eq("product_id", id),
    db.from("product_images").select("url,alt_text,is_primary,sort_order").eq("product_id", id),
  ]);
  if (notes?.length) await db.from("fragrance_notes").insert(notes.map((n: any) => ({ ...n, product_id: newP.id })));
  if (imgs?.length) await db.from("product_images").insert(imgs.map((im: any) => ({ ...im, product_id: newP.id })));
  if (vs?.length) await db.from("variants").insert(vs.map((v: any, i: number) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _vid, created_at: _c, updated_at: _u, ...vr } = v;
    return { ...vr, product_id: newP.id, sku: `${v.sku}-C${stamp}${i}`, stock: 0 };
  }));
  await logEvent({ entityType: "product", entityId: newP.id, event: "product.duplicated", actorType: actorId ? "staff" : "system", actorId, notes: p.name });
  return { ok: true, id: newP.id };
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
  barcode?: string | null; weightGrams?: number | null; lowStockThreshold?: number | null;
  shippingClass?: string | null; packageLengthCm?: number | null; packageWidthCm?: number | null; packageHeightCm?: number | null; supplierSku?: string | null;
}
// Added by 20260805120000 — stripped on a schema error so a variant save works before the migration.
const VARIANT_LOGISTICS_COLUMNS = ["shipping_class", "package_length_cm", "package_width_cm", "package_height_cm", "supplier_sku"];
export async function upsertVariant(input: VariantInput, actorId?: string) {
  if (!input.sku?.trim()) return { ok: false, reason: "SKU required" };
  const db = loose();
  const row: Record<string, unknown> = {
    product_id: input.productId, sku: input.sku.trim().toUpperCase(), variant_name: input.variantName || null,
    vessel_type: input.vesselType || null, size_label: input.sizeLabel || null, price: input.price,
    sale_price: input.salePrice ?? null, cost_price: input.costPrice ?? 0, stock: input.stock ?? 0, is_active: input.isActive ?? true,
    sort_order: input.sortOrder ?? 0, barcode: input.barcode || null, weight_grams: input.weightGrams ?? null,
    shipping_class: input.shippingClass || null, package_length_cm: input.packageLengthCm ?? null,
    package_width_cm: input.packageWidthCm ?? null, package_height_cm: input.packageHeightCm ?? null, supplier_sku: input.supplierSku || null,
    updated_at: new Date().toISOString(),
  };
  // low_stock_threshold is NOT NULL (default 5) — only send it when set, so an unset value takes the
  // DB default on insert (a bare null would violate the constraint) and is left unchanged on update.
  if (input.lowStockThreshold != null) row.low_stock_threshold = input.lowStockThreshold;
  const run = (r: Record<string, unknown>) => (input.id ? db.from("variants").update(r).eq("id", input.id) : db.from("variants").insert(r));
  let { error } = await run(row);
  if (error && /could not find|does not exist|schema cache|PGRST204/i.test(error.message)) {
    const safe = { ...row }; for (const c of VARIANT_LOGISTICS_COLUMNS) delete safe[c];
    ({ error } = await run(safe));
  }
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

// ── Product timeline / activity (Batch A · point 1) ────────────────────────────────────────────────
// Provenance shown INSIDE the editor. Everything is DERIVED from data the app already keeps: the
// products row (created/updated/publish), the audit stream (who touched it + when), and paid order
// lines (last purchased + units). No new columns — read-only surfacing.
export interface ProductTimeline {
  createdAt: string | null; updatedAt: string | null; publishAt: string | null; status: string;
  lastModifiedBy: string | null; lastModifiedAt: string | null;
  lastPurchasedAt: string | null; unitsSold: number; ordersCount: number;
  trail: { event: string; at: string; actorName: string | null; notes: string | null }[];
}
export async function getProductTimeline(id: string): Promise<ProductTimeline> {
  const db = loose();
  const empty: ProductTimeline = { createdAt: null, updatedAt: null, publishAt: null, status: "", lastModifiedBy: null, lastModifiedAt: null, lastPurchasedAt: null, unitsSold: 0, ordersCount: 0, trail: [] };
  try {
    const { data: p } = await db.from("products").select("created_at,updated_at,publish_at,status").eq("id", id).maybeSingle();
    if (!p) return empty;
    // Audit stream for this product (newest first) — resolve staff names so it reads in plain language.
    const { data: ev } = await db.from("audit_events").select("event,created_at,actor_id,actor_type,notes").eq("entity_type", "product").eq("entity_id", id).order("created_at", { ascending: false }).limit(25);
    const events = (ev ?? []) as { event: string; created_at: string; actor_id: string | null; actor_type: string; notes: string | null }[];
    const actorIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (actorIds.length) {
      const { data: us } = await db.from("users").select("id,full_name").in("id", actorIds);
      for (const u of us ?? []) names.set(u.id, u.full_name ?? "");
    }
    const trail = events.map((e) => ({ event: e.event, at: e.created_at, actorName: e.actor_id ? names.get(e.actor_id) ?? null : null, notes: e.notes || null }));
    const lastStaff = events.find((e) => e.actor_type === "staff" && e.actor_id);
    // Last purchased + lifetime units from paid order lines.
    let lastPurchasedAt: string | null = null, unitsSold = 0; const orderIds = new Set<string>();
    try {
      const { data: lines } = await db.from("order_items").select("quantity,order_id,orders!inner(payment_status,created_at)").eq("product_id", id).in("orders.payment_status", ["paid", "partially_refunded", "refunded"]);
      for (const l of lines ?? []) {
        unitsSold += Number(l.quantity ?? 0);
        if (l.order_id) orderIds.add(l.order_id);
        const at = Array.isArray(l.orders) ? l.orders[0]?.created_at : (l.orders as any)?.created_at;
        if (at && (!lastPurchasedAt || at > lastPurchasedAt)) lastPurchasedAt = at;
      }
    } catch { /* order_items optional */ }
    return {
      createdAt: p.created_at ?? null, updatedAt: p.updated_at ?? null, publishAt: p.publish_at ?? null, status: p.status ?? "",
      lastModifiedBy: lastStaff ? (names.get(lastStaff.actor_id as string) || "Staff") : null, lastModifiedAt: lastStaff?.created_at ?? p.updated_at ?? null,
      lastPurchasedAt, unitsSold, ordersCount: orderIds.size, trail,
    };
  } catch {
    return empty;
  }
}

// ── Product relationships (Batch A · point 5) — curated `related_products` overrides ───────────────
// The storefront's getRelatedProducts falls back to the fragrance-family/collection algorithm; these
// manual rows take precedence there (additive — no override rows ⇒ identical behaviour to before).
// One relation_type per (product, target) — the table's unique(product_id, related_product_id).
export const RELATION_TYPES = [
  { v: "related", l: "Related" },
  { v: "upsell", l: "Upsell" },
  { v: "cross_sell", l: "Cross-sell" },
  { v: "pairs_with", l: "Pairs well with" },
  { v: "frequently_bought", l: "Frequently bought together" },
] as const;
const RELATION_TYPE_SET = new Set(RELATION_TYPES.map((r) => r.v));

export interface RelationshipRow { relatedProductId: string; relationType: string; sortOrder: number; name: string; slug: string; imageUrl: string | null; }
export async function getProductRelationships(id: string): Promise<RelationshipRow[]> {
  const db = loose();
  try {
    const { data: rows } = await db.from("related_products").select("related_product_id,relation_type,sort_order").eq("product_id", id).order("sort_order");
    const rels = (rows ?? []) as { related_product_id: string; relation_type: string; sort_order: number }[];
    if (!rels.length) return [];
    const ids = rels.map((r) => r.related_product_id);
    const { data: prods } = await db.from("products").select("id,name,slug,product_images(url,is_primary,sort_order)").in("id", ids);
    const byId = new Map<string, any>((prods ?? []).map((p: any) => [p.id, p]));
    return rels.map((r) => {
      const p = byId.get(r.related_product_id);
      const imgs = (p?.product_images ?? []) as any[];
      const primary = imgs.find((i) => i.is_primary) ?? [...imgs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
      return { relatedProductId: r.related_product_id, relationType: r.relation_type ?? "related", sortOrder: Number(r.sort_order ?? 0), name: p?.name ?? "(deleted product)", slug: p?.slug ?? "", imageUrl: primary?.url ?? null };
    });
  } catch {
    return [];
  }
}
// ── Bulk operations (Batch B · point 12) — safe, non-destructive multi-select actions ─────────────
// One `update … in (ids)` per call (no N+1), one audit event. Deliberately excludes delete/archive as
// a destructive default — status can be set to "archived" explicitly, but there is no silent bulk wipe.
export type ProductBulkAction = "status" | "featured" | "collection" | "bestseller" | "newArrival" | "hero";
const BULK_STATUSES: ProductStatus[] = ["active", "draft", "archived", "out_of_stock"];
export async function bulkUpdateProducts(ids: string[], action: ProductBulkAction, value: unknown, actorId?: string): Promise<{ ok: boolean; done: number; total: number; reason?: string }> {
  const clean = [...new Set((ids ?? []).filter((x): x is string => typeof x === "string" && !!x))].slice(0, 500);
  if (!clean.length) return { ok: false, done: 0, total: 0, reason: "No products selected." };
  const db = loose();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let note = "";
  switch (action) {
    case "status": {
      const s = String(value);
      if (!BULK_STATUSES.includes(s as ProductStatus)) return { ok: false, done: 0, total: clean.length, reason: "Invalid status." };
      row.status = s; note = `status → ${s}`; break;
    }
    case "featured": row.is_featured = Boolean(value); note = `featured → ${Boolean(value)}`; break;
    case "collection": row.collection_id = value ? String(value) : null; note = value ? "assigned to chapter" : "removed from chapter"; break;
    case "bestseller": row.is_bestseller = Boolean(value); note = `best seller → ${Boolean(value)}`; break;
    case "newArrival": row.is_new_arrival = Boolean(value); note = `new arrival → ${Boolean(value)}`; break;
    case "hero": row.is_hero = Boolean(value); note = `hero → ${Boolean(value)}`; break;
    default: return { ok: false, done: 0, total: clean.length, reason: "Unknown bulk action." };
  }
  let { error } = await db.from("products").update(row).in("id", clean);
  // CMS-flag columns may predate their migration — retry without them rather than fail the batch.
  if (error && /could not find|does not exist|schema cache|PGRST204/i.test(error.message) && (action === "bestseller" || action === "newArrival")) {
    return { ok: false, done: 0, total: clean.length, reason: "That flag isn't available yet (pending migration)." };
  }
  if (error) return { ok: false, done: 0, total: clean.length, reason: error.message };
  await logEvent({ entityType: "product", event: `product.bulk_${action}`, actorType: actorId ? "staff" : "system", actorId, notes: `${clean.length} products · ${note}` });
  return { ok: true, done: clean.length, total: clean.length };
}

export async function setProductRelationships(id: string, items: { relatedProductId: string; relationType: string; sortOrder: number }[], actorId?: string) {
  const db = loose();
  // Replace-all: this editor is the sole writer of related_products, so a clean rewrite keeps the set
  // exactly as curated. Skip self-links and dedupe targets (the unique constraint allows one per pair).
  const seen = new Set<string>();
  const rows = items
    .filter((it) => it.relatedProductId && it.relatedProductId !== id)
    .filter((it) => (seen.has(it.relatedProductId) ? false : (seen.add(it.relatedProductId), true)))
    .map((it, i) => ({ product_id: id, related_product_id: it.relatedProductId, relation_type: RELATION_TYPE_SET.has(it.relationType as any) ? it.relationType : "related", sort_order: it.sortOrder ?? i }));
  const { error: delErr } = await db.from("related_products").delete().eq("product_id", id);
  if (delErr) return { ok: false, reason: delErr.message };
  if (rows.length) { const { error } = await db.from("related_products").insert(rows); if (error) return { ok: false, reason: error.message }; }
  await logEvent({ entityType: "product", entityId: id, event: "product.relationships_set", actorType: actorId ? "staff" : "system", actorId, notes: `${rows.length} links` });
  return { ok: true };
}
