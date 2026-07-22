/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Collection / Chapter admin service (review: the Chapter CMS — the biggest architectural gap). Full
 * management of the collections that structure the storefront (Volume → Chapter → Products): create /
 * edit / status / delete, hero-product selection, and product ordering within a chapter. Every change
 * is audited. Additive over the existing collections + products tables — launching a new chapter no
 * longer needs a developer.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";

function loose() { return createAdminClient() as unknown as { from: (t: string) => any }; }

export interface CollectionRow {
  id: string; name: string; slug: string; volume: string | null; tagline: string | null;
  isActive: boolean; isComingSoon: boolean; sortOrder: number; productCount: number; coverImageUrl: string | null;
}

export async function listCollectionsAdmin(): Promise<CollectionRow[]> {
  const db = loose();
  const [{ data: cols }, { data: prods }] = await Promise.all([
    db.from("collections").select("*").order("sort_order"),
    db.from("products").select("collection_id"),
  ]);
  const counts = new Map<string, number>();
  for (const p of prods ?? []) if (p.collection_id) counts.set(p.collection_id, (counts.get(p.collection_id) ?? 0) + 1);
  return (cols ?? []).map((c: any) => ({
    id: c.id, name: c.name, slug: c.slug, volume: c.volume ?? null, tagline: c.tagline ?? null,
    isActive: Boolean(c.is_active), isComingSoon: Boolean(c.is_coming_soon), sortOrder: Number(c.sort_order ?? 0),
    productCount: counts.get(c.id) ?? 0, coverImageUrl: c.cover_image_url ?? null,
  }));
}

export async function getCollectionForEdit(id: string): Promise<{ collection: any; products: { id: string; name: string; displayOrder: number; heroProduct: boolean; productType: string; chapterImage: string }[]; allProducts: { id: string; name: string }[] } | null> {
  const db = loose();
  const { data: collection } = await db.from("collections").select("*").eq("id", id).maybeSingle();
  if (!collection) return null;
  const [{ data: inCol }, { data: all }] = await Promise.all([
    db.from("products").select("id,name,display_order,product_type,air_content").eq("collection_id", id).order("display_order"),
    db.from("products").select("id,name").order("name"),
  ]);
  const products = (inCol ?? []).map((p: any) => ({ id: p.id, name: p.name, displayOrder: Number(p.display_order ?? 0), heroProduct: p.id === collection.hero_product_id, productType: p.product_type ?? "candle", chapterImage: String((p.air_content ?? {}).chapterImage ?? "") }));
  const allProducts = (all ?? []).map((p: any) => ({ id: p.id, name: p.name }));
  return { collection, products, allProducts };
}

/** Set a product's chapter-listing card image (air_content.chapterImage) — a different picture from its
 *  PDP hero. Merges into air_content so nothing else is lost. */
export async function setProductChapterImage(productId: string, url: string, actorId?: string) {
  const db = loose();
  const { data: p } = await db.from("products").select("air_content").eq("id", productId).maybeSingle();
  const ac = ((p?.air_content ?? {}) as Record<string, unknown>);
  const { error } = await db.from("products").update({ air_content: { ...ac, chapterImage: url || undefined }, updated_at: new Date().toISOString() }).eq("id", productId);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "product", entityId: productId, event: "product.chapter_image", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export interface CollectionInput {
  name?: string; slug?: string; volume?: string; tagline?: string; poeticLine?: string; description?: string;
  intro?: string; storyLong?: string; coverImageUrl?: string; heroMobileUrl?: string; heroProductId?: string | null;
  seoTitle?: string; seoDescription?: string; seoOgImage?: string; sortOrder?: number; isActive?: boolean; isComingSoon?: boolean;
  airChapter?: Record<string, unknown> | null; // air chapter CMS config (group headings/notes, teaser, hero eyebrow, colours)
}

// Columns added by later CMS migrations — stripped on retry if the migration isn't applied yet.
const CMS_COLUMNS = ["hero_mobile_url", "intro", "story_long", "seo_og_image", "air_chapter"];

function collectionRow(i: CollectionInput): Record<string, unknown> {
  const r: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const s = (k: string, v: string | undefined) => { if (v !== undefined) r[k] = v || null; };
  if (i.name !== undefined) r.name = i.name.trim();
  if (i.slug !== undefined) r.slug = i.slug.trim();
  s("volume", i.volume); s("tagline", i.tagline); s("poetic_line", i.poeticLine); s("description", i.description);
  s("intro", i.intro); s("story_long", i.storyLong); s("cover_image_url", i.coverImageUrl); s("hero_mobile_url", i.heroMobileUrl);
  s("seo_title", i.seoTitle); s("seo_description", i.seoDescription); s("seo_og_image", i.seoOgImage);
  if (i.heroProductId !== undefined) r.hero_product_id = i.heroProductId || null;
  if (i.sortOrder !== undefined) r.sort_order = i.sortOrder;
  if (i.isActive !== undefined) r.is_active = i.isActive;
  if (i.isComingSoon !== undefined) r.is_coming_soon = i.isComingSoon;
  if (i.airChapter !== undefined) r.air_chapter = i.airChapter;
  return r;
}

export async function createCollection(input: { name: string; slug: string; volume?: string }, actorId?: string) {
  if (!input.name?.trim() || !input.slug?.trim()) return { ok: false, reason: "name and slug are required" };
  const db = loose();
  const { data: existing } = await db.from("collections").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;
  const { data, error } = await db.from("collections").insert({ name: input.name.trim(), slug: input.slug.trim(), volume: input.volume?.trim() || null, is_active: false, is_coming_soon: true, sort_order: nextSort }).select("id").single();
  if (error || !data) return { ok: false, reason: /duplicate|unique/i.test(error?.message ?? "") ? "slug already exists" : error?.message ?? "insert failed" };
  await logEvent({ entityType: "collection", entityId: data.id, event: "collection.created", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true, id: data.id };
}

export async function updateCollection(id: string, input: CollectionInput, actorId?: string) {
  const db = loose();
  const row = collectionRow(input);
  let { error } = await db.from("collections").update(row).eq("id", id);
  if (error && /could not find|does not exist|schema cache|PGRST204/i.test(error.message)) {
    const safe = { ...row }; for (const c of CMS_COLUMNS) delete safe[c];
    ({ error } = await db.from("collections").update(safe).eq("id", id));
  }
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "slug already exists" : error.message };
  await logEvent({ entityType: "collection", entityId: id, event: "collection.updated", actorType: actorId ? "staff" : "system", actorId, notes: input.name });
  return { ok: true };
}

export async function setCollectionStatus(id: string, isActive: boolean, actorId?: string) {
  const db = loose();
  const { error } = await db.from("collections").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "collection", entityId: id, event: isActive ? "collection.activated" : "collection.archived", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export async function deleteCollection(id: string, actorId?: string) {
  const db = loose();
  const { data: prods } = await db.from("products").select("id").eq("collection_id", id).limit(1);
  if ((prods ?? []).length) return { ok: false, reason: "Move or unassign its products first." };
  const { error } = await db.from("collections").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "collection", entityId: id, event: "collection.deleted", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

/** Set a product's order within its chapter (Continue-the-Chapter grid). */
export async function setProductDisplayOrder(productId: string, displayOrder: number, actorId?: string) {
  const db = loose();
  const { error } = await db.from("products").update({ display_order: displayOrder, updated_at: new Date().toISOString() }).eq("id", productId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** Assign / unassign a product to a chapter. */
export async function assignProductToCollection(productId: string, collectionId: string | null, actorId?: string) {
  const db = loose();
  const { error } = await db.from("products").update({ collection_id: collectionId, updated_at: new Date().toISOString() }).eq("id", productId);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "collection", entityId: collectionId ?? productId, event: "collection.product_assigned", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}
