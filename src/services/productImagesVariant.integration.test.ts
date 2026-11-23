import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { addProductImage, getProductForEdit } from "@/services/productAdminService";

/**
 * Per-variant product images (the admin gallery upload path). LOCAL Supabase only. Proves that
 * MULTIPLE images can be added to each gallery — the shared/default set AND each variant (vessel+size) —
 * i.e. the "second upload" works, that sort_order numbers each gallery independently from 0, and that
 * exactly one primary exists (the shared lead; variant images are never primary, keeping the
 * one-primary-per-product index valid).
 */
const URL = process.env.INV_TEST_SUPABASE_URL || "";
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL.replace(/\/$/, ""));
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL.replace(/\/$/, "")}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
async function ins(t: string, row: unknown) {
  const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`ins ${t}: ${await r.text()}`);
  return (await r.json())[0];
}
async function del(p: string) { await fetch(rest(p), { method: "DELETE", headers: H }); }

const TAG = `PIV-${Date.now()}`;
let catId = "", prodId = "", vCeramic = "", vGlass = "";

beforeAll(async () => {
  if (!RUN) return;
  catId = (await ins("categories", { name: TAG, slug: TAG.toLowerCase(), sku_prefix: "PIV", default_hsn_code: "3406" })).id;
  prodId = (await ins("products", { name: `${TAG} p`, slug: TAG.toLowerCase(), base_sku: `${TAG}-B`, category_id: catId, status: "active", product_type: "candle", hsn_code: "3406", gst_rate: 12, price: 500 })).id;
  vCeramic = (await ins("variants", { product_id: prodId, sku: `${TAG}-C`, variant_name: "ceramic", vessel_type: "ceramic", size_label: "100g", price: 500, stock: 5, low_stock_threshold: 1 })).id;
  vGlass = (await ins("variants", { product_id: prodId, sku: `${TAG}-G`, variant_name: "glass", vessel_type: "glass", size_label: "190g", price: 600, stock: 5, low_stock_threshold: 1 })).id;
});
afterAll(async () => {
  if (!RUN || !prodId) return;
  await del(`/product_images?product_id=eq.${prodId}`);
  await del(`/variants?product_id=eq.${prodId}`);
  await del(`/products?id=eq.${prodId}`);
  await del(`/categories?id=eq.${catId}`);
});

d("product images — per variant (admin upload path)", () => {
  it("adds MULTIPLE images to each gallery (the 'second upload' works); scoping & primary correct", async () => {
    // Shared/default gallery: two uploads — the second is exactly what was reported as failing.
    expect((await addProductImage(prodId, "https://x/shared1.jpg", "s1")).ok).toBe(true);
    expect((await addProductImage(prodId, "https://x/shared2.jpg", "s2")).ok).toBe(true);
    // Ceramic·100g variant: two uploads.
    expect((await addProductImage(prodId, "https://x/cer1.jpg", "c1", undefined, vCeramic)).ok).toBe(true);
    expect((await addProductImage(prodId, "https://x/cer2.jpg", "c2", undefined, vCeramic)).ok).toBe(true);
    // Glass·190g variant: two uploads.
    expect((await addProductImage(prodId, "https://x/gl1.jpg", "g1", undefined, vGlass)).ok).toBe(true);
    expect((await addProductImage(prodId, "https://x/gl2.jpg", "g2", undefined, vGlass)).ok).toBe(true);

    const edit = await getProductForEdit(prodId);
    const imgs = edit!.images;
    const shared = imgs.filter((i) => i.variantId == null).sort((a, b) => a.sortOrder - b.sortOrder);
    const cer = imgs.filter((i) => i.variantId === vCeramic).sort((a, b) => a.sortOrder - b.sortOrder);
    const gl = imgs.filter((i) => i.variantId === vGlass).sort((a, b) => a.sortOrder - b.sortOrder);

    // All six images persisted, grouped by their gallery, in order.
    expect(shared.map((i) => i.url)).toEqual(["https://x/shared1.jpg", "https://x/shared2.jpg"]);
    expect(cer.map((i) => i.url)).toEqual(["https://x/cer1.jpg", "https://x/cer2.jpg"]);
    expect(gl.map((i) => i.url)).toEqual(["https://x/gl1.jpg", "https://x/gl2.jpg"]);

    // sort_order numbers each gallery independently from 0.
    expect(cer.map((i) => i.sortOrder)).toEqual([0, 1]);
    expect(gl.map((i) => i.sortOrder)).toEqual([0, 1]);

    // Exactly one primary (the shared lead); variant images are never primary.
    expect(imgs.filter((i) => i.isPrimary).length).toBe(1);
    expect(shared[0].isPrimary).toBe(true);
    expect([...cer, ...gl].every((i) => !i.isPrimary)).toBe(true);
  });
});
