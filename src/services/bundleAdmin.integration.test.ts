import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

/**
 * Phase 1A — Bundle admin service state-transition + audit evidence. LOCAL Supabase only.
 * Proves draft/published separation, publish validation, revision-on-publish, restore semantics, reset
 * (draft-only), audit, malformed-can't-go-live, and that draft never leaks to the storefront read.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
const ANON = process.env.INV_TEST_ANON_KEY || "";
if (RUN) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON; // getBundleCandles (public client) reads eligible candles locally
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
const ins = async (t: string, row: any) => { const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) }); if (!r.ok) throw new Error(`${t} ${await r.text()}`); return (await r.json())[0]; };
const sel = async (p: string) => (await fetch(rest(p), { headers: H })).json();
const delBundle = () => fetch(rest(`/bundle_pages?bundle_key=eq.discovery`), { method: "DELETE", headers: H });
const delRevs = () => fetch(rest(`/cms_revisions?resource_type=eq.bundle`), { method: "DELETE", headers: H });

import {
  getBundleAdmin, saveBundleDraft, publishBundle, resetBundleToDefault,
  listBundleRevisions, restoreBundleRevisionToDraft, restoreBundleRevisionAndPublish,
} from "@/services/bundleAdminService";
import { getPublishedBundleConfig } from "@/services/bundlePageService";
import { DEFAULT_BUNDLE_CONFIG } from "@/lib/bundleConfig";

const TAG = `BADM-${Date.now()}`;
const PRODUCT_IDS: string[] = [];
const VARIANT_IDS: string[] = []; // all seeded variant ids (glass+ceramic for each product)
// Stock is column-privilege-revoked from service_role (Phase 1A) — mutate ONLY via the canonical RPC.
const setStock = (variantId: string, qty: number) =>
  fetch(rest(`/rpc/adjust_inventory`), { method: "POST", headers: H, body: JSON.stringify({ p: { variant_id: variantId, mode: "set", qty, reason: "Physical count correction" } }) });

d("Bundle admin service (Phase 1A)", () => {
  beforeAll(async () => {
    if (!RUN) return;
    const cat = await ins("categories", { name: TAG, slug: TAG.toLowerCase(), sku_prefix: "BAD", default_hsn_code: "3406", default_gst_rate: 12 });
    const col = await ins("collections", { name: "Dessert Chapter", slug: `dessert-${TAG.toLowerCase()}`, volume: "Vol. I", is_active: true });
    for (let i = 0; i < 3; i++) {
      const p = await ins("products", { name: `${TAG}-${i}`, slug: `${TAG.toLowerCase()}-${i}`, base_sku: `${TAG}-${i}`, category_id: cat.id, collection_id: col.id, status: "active", product_type: "candle", hsn_code: "3406", gst_rate: 12, price: 500, tagline: "t" });
      PRODUCT_IDS.push(p.id);
      for (const v of ["glass", "ceramic"]) {
        const row = await ins("variants", { product_id: p.id, sku: `${TAG}-${i}-${v}`, vessel_type: v, size_label: "100g", variant_name: v, price: 500, stock: 10, low_stock_threshold: 2, is_active: true, sort_order: 0 });
        VARIANT_IDS.push(row.id);
      }
    }
  });
  beforeEach(async () => { if (RUN) { await delBundle(); await delRevs(); } });
  afterAll(async () => {
    if (!RUN) return;
    await delBundle(); await delRevs();
    await fetch(rest(`/variants?sku=like.${TAG}*`), { method: "DELETE", headers: H });
    await fetch(rest(`/products?slug=like.${TAG.toLowerCase()}*`), { method: "DELETE", headers: H });
    await fetch(rest(`/collections?slug=like.dessert-${TAG.toLowerCase()}*`), { method: "DELETE", headers: H });
    await fetch(rest(`/categories?slug=eq.${TAG.toLowerCase()}`), { method: "DELETE", headers: H });
  });

  const cfg = (heading: string) => ({ ...DEFAULT_BUNDLE_CONFIG, hero: { ...DEFAULT_BUNDLE_CONFIG.hero, heading } });

  it("DEFAULT fallback intact when no row", async () => {
    expect(await getPublishedBundleConfig()).toEqual(DEFAULT_BUNDLE_CONFIG);
  });

  it("save draft → storefront published UNCHANGED; draft never leaks", async () => {
    await saveBundleDraft(cfg("DRAFT ONLY"));
    const live = await getPublishedBundleConfig();
    expect(live).toEqual(DEFAULT_BUNDLE_CONFIG); // no published → still DEFAULT
    expect(live.hero.heading).not.toBe("DRAFT ONLY");
    const st = await getBundleAdmin();
    expect(st.draft.hero.heading).toBe("DRAFT ONLY");
    expect(st.published).toBeNull();
    expect(st.neverPublished).toBe(true);
  });

  it("publish → published becomes the validated config; revision created ON PUBLISH; audit emitted", async () => {
    const before = (await listBundleRevisions()).length;
    const r = await publishBundle(cfg("LIVE HEADING"));
    expect(r.ok).toBe(true);
    expect((await getPublishedBundleConfig()).hero.heading).toBe("LIVE HEADING");
    expect((await listBundleRevisions()).length).toBe(before + 1); // publish-only snapshot
    const audit = await sel(`/audit_events?event=eq.bundle.published&select=id&order=created_at.desc&limit=1`);
    expect(audit.length).toBe(1);
  });

  it("invalid publish → errors + old published survives EXACTLY; no revision", async () => {
    await publishBundle(cfg("GOOD LIVE"));
    const revs = (await listBundleRevisions()).length;
    const bad = await publishBundle(cfg("   ")); // empty heading → structural ERROR
    expect(bad.ok).toBe(false);
    expect(bad.errors && bad.errors.length).toBeTruthy();
    expect((await getPublishedBundleConfig()).hero.heading).toBe("GOOD LIVE"); // unchanged
    expect((await listBundleRevisions()).length).toBe(revs); // no new revision
  });

  it("save draft does not snapshot a revision (revisions are publish-only)", async () => {
    const before = (await listBundleRevisions()).length;
    await saveBundleDraft(cfg("D1"));
    await saveBundleDraft(cfg("D2"));
    expect((await listBundleRevisions()).length).toBe(before);
  });

  it("reset-to-default loads DEFAULT into DRAFT; published stays live (storefront unchanged)", async () => {
    await publishBundle(cfg("STILL LIVE"));
    await saveBundleDraft(cfg("EDITING"));
    await resetBundleToDefault();
    expect((await getBundleAdmin()).draft).toEqual(DEFAULT_BUNDLE_CONFIG); // draft reset
    expect((await getPublishedBundleConfig()).hero.heading).toBe("STILL LIVE"); // live untouched
  });

  it("V3 — restore-to-draft (no live change/no revision/no publish audit) vs restore+publish (live + revision + audit)", async () => {
    await publishBundle(cfg("V1 LIVE"));
    await publishBundle(cfg("V2 LIVE"));
    const revs = await listBundleRevisions(); // newest first: V2, V1
    const v1 = revs[revs.length - 1].id;

    // restore-to-draft — live still V2, no new revision, no restore-publish audit
    const revCountA = (await listBundleRevisions()).length;
    await restoreBundleRevisionToDraft(v1);
    expect((await getBundleAdmin()).draft.hero.heading).toBe("V1 LIVE");
    expect((await getPublishedBundleConfig()).hero.heading).toBe("V2 LIVE"); // unchanged
    expect((await listBundleRevisions()).length).toBe(revCountA); // no revision on restore-to-draft
    expect((await sel(`/audit_events?event=eq.bundle.revision_restored&select=id`)).length).toBeGreaterThan(0);

    // restore + publish V1 — live now V1, a NEW publish snapshot, and the restore+publish audit
    const rpAuditBefore = (await sel(`/audit_events?event=eq.bundle.revision_restored_and_published&select=id`)).length;
    await restoreBundleRevisionAndPublish(v1);
    expect((await getPublishedBundleConfig()).hero.heading).toBe("V1 LIVE");
    expect((await listBundleRevisions()).length).toBe(revCountA + 1); // canonical publish snapshot
    expect((await sel(`/audit_events?event=eq.bundle.revision_restored_and_published&select=id`)).length).toBe(rpAuditBefore + 1);
    // all revisions live in the shared cms_revisions store — no second revision mechanism
    const bundleRevs = await sel(`/cms_revisions?resource_type=eq.bundle&select=id`);
    expect(bundleRevs.length).toBe(revCountA + 1);
  });

  it("V1 — malformed Admin publish is REJECTED (not normalized-then-published); published unchanged", async () => {
    await publishBundle(cfg("REAL LIVE")); // establish a live config
    const revs = (await listBundleRevisions()).length;
    const bad = await publishBundle({ garbage: true } as unknown);
    expect(bad.ok).toBe(false);
    expect(bad.errors && bad.errors.some((e) => /Malformed/.test(e))).toBe(true);
    expect((await getPublishedBundleConfig()).hero.heading).toBe("REAL LIVE"); // untouched — no DEFAULT publish
    expect((await listBundleRevisions()).length).toBe(revs); // no revision
    // storefront read fallback is a DIFFERENT contract: a corrupt PERSISTED published still normalizes safely
    // (proven in bundlePage.integration.test.ts V3-D) — that defensive behavior is unchanged.
  });

  it("V2-A — CONFIG-caused impossible composition → Publish ERROR; nothing mutates", async () => {
    await publishBundle(cfg("BASELINE LIVE"));
    const revs = (await listBundleRevisions()).length;
    const auditBefore = (await sel(`/audit_events?event=eq.bundle.published&select=id`)).length;
    // exclude 2 of the 3 products → each enabled vessel left with 1 selectable (< 3)
    const bad = await publishBundle({ ...cfg("SHOULD NOT PUBLISH"), excludedProductIds: [PRODUCT_IDS[0], PRODUCT_IDS[1]] });
    expect(bad.ok).toBe(false);
    expect(bad.errors && bad.errors.some((e) => /selectable candle/.test(e))).toBe(true);
    expect((await getPublishedBundleConfig()).hero.heading).toBe("BASELINE LIVE"); // byte-identical previous published
    expect((await listBundleRevisions()).length).toBe(revs); // no publish revision
    expect((await sel(`/audit_events?event=eq.bundle.published&select=id`)).length).toBe(auditBefore); // no bundle.published
  });

  it("V2-B — INVENTORY-caused OOS (≥3 configured, <3 sellable) → WARNING; Publish allowed; no inventory persisted", async () => {
    // Make 2 of the 3 products OOS via the CANONICAL inventory RPC → eligible 3, sellable 1 (< 3) per vessel.
    const oos = VARIANT_IDS.slice(0, 4); // product 0 + product 1 (glass+ceramic each)
    for (const vid of oos) await setStock(vid, 0);
    try {
      const r = await publishBundle(cfg("PUBLISHED WITH WARNING"));
      expect(r.ok).toBe(true); // WARNING does not block
      expect(r.warnings && r.warnings.some((w) => /currently in stock/.test(w))).toBe(true);
      expect((await getPublishedBundleConfig()).hero.heading).toBe("PUBLISHED WITH WARNING");
      // no inventory/runtime state leaked into the persisted config
      const stored = (await sel(`/bundle_pages?bundle_key=eq.discovery&select=published`))[0].published;
      expect(JSON.stringify(stored)).not.toMatch(/stock|sellable|inStock/i);
    } finally {
      for (const vid of oos) await setStock(vid, 10); // restore
    }
  });
});
