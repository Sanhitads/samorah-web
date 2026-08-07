import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { normalizeBundleConfig, DEFAULT_BUNDLE_CONFIG } from "@/lib/bundleConfig";

/**
 * Phase 0 — bundle_pages DB + RLS + default/live fallback evidence. LOCAL Supabase only.
 * Proves: table accepts a published BundleConfig; RLS is service-role only (anon cannot read);
 * round-trip stable; and the storefront service (getPublishedBundleConfig) fail-safe boundaries V3-A..D.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const ANON = process.env.INV_TEST_ANON_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && ANON && LOCAL);
const d = RUN ? describe : describe.skip;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const AH = { apikey: ANON, Authorization: `Bearer ${ANON}` };
const rest = (p: string) => `${URL}/rest/v1${p}`;
// Point the service's admin client at LOCAL (gated on the local INV_TEST vars — never hosted).
if (RUN) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
}
const del = () => fetch(rest(`/bundle_pages?bundle_key=eq.discovery`), { method: "DELETE", headers: H });
const put = (row: unknown) =>
  fetch(rest(`/bundle_pages`), { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row) });

d("bundle_pages — DB + RLS (Phase 0)", () => {
  afterAll(async () => {
    if (RUN) await del();
  });

  it("accepts a published BundleConfig; anon CANNOT read it; service-role can; round-trips", async () => {
    const cfg = { ...DEFAULT_BUNDLE_CONFIG, hero: { ...DEFAULT_BUNDLE_CONFIG.hero, heading: "Compose Your\nThree" } };
    const ins = await fetch(rest(`/bundle_pages`), {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ bundle_key: "discovery", published: cfg, status: "published" }),
    });
    expect(ins.ok).toBe(true);

    // RLS: no public policy → anon read returns zero rows (config is server-only truth).
    const anonRead = await fetch(rest(`/bundle_pages?bundle_key=eq.discovery&select=published`), { headers: AH });
    const anonRows = await anonRead.json();
    expect(Array.isArray(anonRows) ? anonRows.length : 0).toBe(0);

    // Service-role read + normalize round-trip is stable.
    const svc = await fetch(rest(`/bundle_pages?bundle_key=eq.discovery&select=published`), { headers: H });
    const rows = await svc.json();
    expect(rows.length).toBe(1);
    const normalized = normalizeBundleConfig(rows[0].published);
    expect(normalized.hero.heading).toBe("Compose Your\nThree");
    expect(normalizeBundleConfig(normalized)).toEqual(normalized); // idempotent
  });
});

d("V3 — default/live fallback boundaries (getPublishedBundleConfig)", () => {
  beforeEach(async () => {
    await del();
  });
  afterAll(async () => {
    await del();
  });

  it("A — no bundle_pages row → DEFAULT config", async () => {
    const { getPublishedBundleConfig } = await import("@/services/bundlePageService");
    expect(await getPublishedBundleConfig()).toEqual(DEFAULT_BUNDLE_CONFIG);
  });

  it("B — status='draft' (no valid published) → DEFAULT remains storefront-live", async () => {
    await put({ bundle_key: "discovery", status: "draft", draft: { ...DEFAULT_BUNDLE_CONFIG, hero: { ...DEFAULT_BUNDLE_CONFIG.hero, heading: "DRAFT ONLY" } }, published: null });
    const { getPublishedBundleConfig } = await import("@/services/bundlePageService");
    expect(await getPublishedBundleConfig()).toEqual(DEFAULT_BUNDLE_CONFIG); // draft never leaks to storefront
  });

  it("C — valid published config → published config renders", async () => {
    await put({ bundle_key: "discovery", status: "published", published: { ...DEFAULT_BUNDLE_CONFIG, hero: { ...DEFAULT_BUNDLE_CONFIG.hero, heading: "LIVE HEADING" } } });
    const { getPublishedBundleConfig } = await import("@/services/bundlePageService");
    expect((await getPublishedBundleConfig()).hero.heading).toBe("LIVE HEADING");
  });

  it("D — malformed/corrupt published JSON → safe DEFAULT fallback (no exception)", async () => {
    await put({ bundle_key: "discovery", status: "published", published: { garbage: true, hero: 123 } });
    const { getPublishedBundleConfig } = await import("@/services/bundlePageService");
    const cfg = await getPublishedBundleConfig();
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.hero.heading).toBe(DEFAULT_BUNDLE_CONFIG.hero.heading); // normalized to default, no crash
  });
});
