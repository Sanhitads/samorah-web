import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * SEO Phase 1 — redirect graph + destination lifecycle + effective-resolver faithfulness, against the
 * real DB. Uses sandbox paths ("/seo-it-*") that are cleaned up. Proves: nonexistent internal
 * destination BLOCKS, valid live destination allows, chain warns + resolves the final target, a live
 * source needs confirmation, and getEffectiveSeo reflects the SAME values as getRouteSeo (point 9).
 * Env-gated + self-cleaning.
 */
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* skip below */ }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = !!(URL && KEY);
const d = RUN ? describe : describe.skip;
const H = { apikey: KEY!, Authorization: `Bearer ${KEY!}`, "Content-Type": "application/json" };
const del = (table: string, q: string) => fetch(`${URL}/rest/v1/${table}?${q}`, { method: "DELETE", headers: H });

let svc: typeof import("@/services/seoRedirectService");
const OLD = "/seo-it-old", ROUTE = "/seo-it-route";
// Multi-segment namespaced sandbox paths. A SINGLE-segment redirect DESTINATION is (correctly) read as a
// CMS page slug and rejected when that page doesn't exist; multi-segment paths classify as "unknown" (a
// soft warning), so these sandbox destinations don't trip the production broken-destination guard.
const EA = "/seo-it/edit/a", EA_MOVED = "/seo-it/edit/a-moved", EB = "/seo-it/edit/b";
const ED1 = "/seo-it/edit/dest-1", ED2 = "/seo-it/edit/dest-2";
const COLD = "/seo-it/chain/old", CMID = "/seo-it/chain/mid", CFIN = "/seo-it/chain/final";
const VSRC = "/seo-it/validate/src";
const NONEXISTENT_PAGE = "/seo-it-nonexistent-page-xyz"; // single-segment slug with no CMS page → must be rejected
const rest = (table: string, q: string) => fetch(`${URL}/rest/v1/${table}?${q}`, { headers: H }).then((r) => r.json());
const patch = (table: string, q: string, body: unknown) => fetch(`${URL}/rest/v1/${table}?${q}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body) });

// A non-empty product catalog is a PRECONDITION for broken-destination detection: verdictFor (navValidation)
// only flags a nonexistent /shop/{slug} as "missing" when the products index is non-empty — an intentional
// fail-safe that never cries "broken" when it has no catalog to check against (navValidation.ts:112). So seed
// one active product to make this suite SELF-CONTAINED; without it the "BLOCKS a nonexistent internal
// destination" assertion silently depended on another test's leftover catalog rows in the shared DB.
const FX = `seo-it-${Date.now()}`;
let fxCategoryId = "", fxProductId = "", fxPageSlug = "";
const insOne = async (table: string, row: unknown) => {
  const r = await fetch(`${URL}/rest/v1/${table}`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`${table} ${await r.text()}`);
  return (await r.json())[0];
};

beforeAll(async () => {
  if (!RUN) return;
  svc = await import("@/services/seoRedirectService");
  const cat = await insOne("categories", { name: FX, slug: FX, sku_prefix: "SEO", default_hsn_code: "3406", default_gst_rate: 12 });
  fxCategoryId = cat.id;
  const prod = await insOne("products", { name: FX, slug: `${FX}-prod`, base_sku: FX, category_id: cat.id, status: "active", product_type: "candle", hsn_code: "3406", gst_rate: 12, price: 500, tagline: "t" });
  fxProductId = prod.id;
  // Seed one CMS page so the destination index is non-empty — makes the single-segment-page rejection
  // test deterministic (verdictFor only flags a missing page slug when cms_pages is non-empty).
  fxPageSlug = `${FX}-page`;
  await insOne("cms_pages", { slug: fxPageSlug, title: FX });
});
const WRS = "/seo-it-wrs";
afterAll(async () => {
  if (!RUN) return;
  await del("redirects", `from_path=in.(${[OLD, EA, EA_MOVED, EB, COLD, CMID, CFIN, VSRC].join(",")})`);
  await del("seo_overrides", `path=in.(${[ROUTE, WRS, "/about", "/journal"].join(",")})`);
  if (fxProductId) await del("products", `id=eq.${fxProductId}`);
  if (fxCategoryId) await del("categories", `id=eq.${fxCategoryId}`);
  if (fxPageSlug) await del("cms_pages", `slug=eq.${fxPageSlug}`);
});

d("custom JSON-LD (mechanism A) reaches the storefront emitter for about/journal (P0-6)", () => {
  it("stored seo_overrides.structured_data is returned by getRouteStructuredData for /about and /journal", async () => {
    const jsonld = { "@context": "https://schema.org", "@type": "WebPage", name: "About Samorah" };
    for (const p of ["/about", "/journal"]) {
      await svc.upsertSeoOverride({ path: p, structuredData: JSON.stringify(jsonld) }, { confirmed: true });
      expect(await svc.getRouteStructuredData(p)).toEqual(jsonld); // the exact fn the fixed page now calls
      await svc.deleteSeoOverride(p);
      expect(await svc.getRouteStructuredData(p)).toBeNull(); // removed → nothing emitted
    }
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const canon = (m: any) => m.alternates?.canonical;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ogImages = (m: any) => m.openGraph?.images;

d("external redirect destinations are blocked server-side (P1-8, real DB)", () => {
  it("blocks absolute + protocol-relative external destinations with the standard copy; allows internal", async () => {
    for (const bad of ["https://evil.com", "http://evil.com/x", "//evil.com/x"]) {
      const a = await svc.analyzeRedirect({ fromPath: "/ext-old", toPath: bad });
      expect(a.errors.some((e) => /External redirect destinations aren't supported/i.test(e)), bad).toBe(true);
    }
    expect((await svc.analyzeRedirect({ fromPath: "/ext-old", toPath: "/shop" })).errors).toEqual([]);
  });
  it("cannot PERSIST an external destination even through a crafted service call (confirmed:true)", async () => {
    const r = await svc.upsertRedirect({ fromPath: "/ext-crafted", toPath: "https://evil.com" }, { confirmed: true });
    expect(r.ok).toBe(false);
    expect((await svc.listRedirects()).some((x) => x.fromPath === "/ext-crafted")).toBe(false); // nothing written
  });
});

d("SEO override route-existence validation (P0-3, Invariant 4, real DB)", () => {
  it("an unresolved custom path (likely typo) requires confirmation, a known route does not", async () => {
    const typo = await svc.analyzeSeoOverride({ path: "/abuot" });
    expect(typo.errors).toEqual([]); // structurally valid — not blocked, but…
    expect(typo.confirmations.some((c) => /doesn't match a known storefront route/i.test(c))).toBe(true);

    const known = await svc.analyzeSeoOverride({ path: "/about" }); // static storefront route
    expect(known.confirmations.some((c) => /known storefront route/i.test(c))).toBe(false);
  });

  it("upsert BLOCKS an unresolved-path override until confirmed (server-enforced)", async () => {
    const blocked = await svc.upsertSeoOverride({ path: "/abuot-typo-xyz", title: "T" }, {});
    expect(blocked.ok).toBe(false);
    expect(blocked.analysis?.confirmations.length).toBeGreaterThan(0);
    await svc.deleteSeoOverride("/abuot-typo-xyz"); // no row created, but be safe
  });
});

d("storefront withRouteSeo override round-trip (P0-1, Invariant 1 at the storefront)", () => {
  it("inherited → override → storefront metadata changes → remove → inherited (title/desc/canonical/robots/OG)", async () => {
    const base = { title: "Base Title", description: "Base description", openGraph: { images: ["https://base.example/og.jpg"] } };
    await svc.deleteSeoOverride(WRS); // clean slate

    // Baseline: no override → withRouteSeo returns the route's own base (site defaults may fill description/OG).
    const inherited = await svc.withRouteSeo(WRS, base);
    expect(inherited.title).toBe("Base Title");

    // Add an override — the ACTUAL storefront mapping must change (not just getRouteSeo).
    await svc.upsertSeoOverride({ path: WRS, title: "Override Title", description: "Override description", canonical: `https://samorahstudio.com${WRS}`, robots: "noindex", ogImage: "https://cdn.example/override-og.jpg" }, { confirmed: true });
    const overridden = await svc.withRouteSeo(WRS, base);
    expect(overridden.title).toEqual({ absolute: "Override Title" });      // explicit override title wins, marked absolute (template won't append the brand)
    expect(overridden.description).toBe("Override description");            // description override wins
    expect(canon(overridden)).toBe(`https://samorahstudio.com${WRS}`);     // canonical → alternates.canonical
    expect(overridden.robots).toBe("noindex");                             // robots override
    expect(ogImages(overridden)).toEqual(["https://cdn.example/override-og.jpg"]); // ogImage → openGraph.images

    // Remove the override → storefront returns to the exact inherited state (not empty, not stale).
    await svc.deleteSeoOverride(WRS);
    const restored = await svc.withRouteSeo(WRS, base);
    expect(restored.title).toBe(inherited.title);
    expect(restored.description).toBe(inherited.description);
    expect(canon(restored)).toBe(canon(inherited));   // canonical cleared back to inherited
    expect(restored.robots).toBe(inherited.robots);   // robots cleared
    expect(ogImages(restored)).toEqual(ogImages(inherited)); // OG back to the base image
  });
});

d("redirect editing preserves identity + re-validates the graph (P1)", () => {
  // SELF-CONTAINED: each test creates its own redirects; this clears them so nothing leaks between tests.
  afterEach(async () => { await del("redirects", `from_path=in.(${[EA, EA_MOVED, EB].join(",")})`); });

  it("editing updates the row by id (id + hits preserved), never inserts a duplicate", async () => {
    expect((await svc.upsertRedirect({ fromPath: EA, toPath: ED1 }, { confirmed: true })).ok).toBe(true);
    const created = (await rest("redirects", `from_path=eq.${EA}&select=id,hits`))[0];
    await patch("redirects", `id=eq.${created.id}`, { hits: 7 }); // simulate accrued history

    // Edit the destination via update-by-id.
    expect((await svc.upsertRedirect({ id: created.id, fromPath: EA, toPath: ED2 }, { confirmed: true })).ok).toBe(true);
    const afterEdit = (await rest("redirects", `from_path=eq.${EA}&select=id,to_path,hits`))[0];
    expect(afterEdit.id).toBe(created.id);   // identity preserved
    expect(afterEdit.hits).toBe(7);          // history preserved (an insert would reset to 0)
    expect(afterEdit.to_path).toBe(ED2);
    expect((await rest("redirects", `from_path=eq.${EA}&select=id`)).length).toBe(1); // no duplicate row
  });

  it("editing the SOURCE path keeps the same id (identity), and re-runs graph validation", async () => {
    // Create our OWN row (no reliance on a previous test).
    expect((await svc.upsertRedirect({ fromPath: EA, toPath: ED1 }, { confirmed: true })).ok).toBe(true);
    const row = (await rest("redirects", `from_path=eq.${EA}&select=id`))[0];
    expect((await svc.upsertRedirect({ id: row.id, fromPath: EA_MOVED, toPath: ED1 }, { confirmed: true })).ok).toBe(true);
    expect((await rest("redirects", `from_path=eq.${EA}&select=id`)).length).toBe(0); // old source gone
    const moved = (await rest("redirects", `from_path=eq.${EA_MOVED}&select=id`))[0];
    expect(moved.id).toBe(row.id); // same identity, source changed

    // A source edit that collides with another redirect's source is blocked by the graph analyzer.
    await svc.upsertRedirect({ fromPath: EB, toPath: ED2 }, { confirmed: true });
    const collide = await svc.upsertRedirect({ id: moved.id, fromPath: EB, toPath: ED1 }, { confirmed: true });
    expect(collide.ok).toBe(false);
    expect(collide.analysis?.errors.some((e) => /already sends/i.test(e))).toBe(true);
  });
});

d("redirect analysis + destination lifecycle (real DB)", () => {
  // SELF-CONTAINED: the chain/loop tests each establish their own CMID→CFIN edge; clear it after each test.
  afterEach(async () => { await del("redirects", `from_path=in.(${[COLD, CMID, CFIN, VSRC].join(",")})`); });

  it("BLOCKS a nonexistent internal destination (a /shop/<slug> product that doesn't exist)", async () => {
    const a = await svc.analyzeRedirect({ fromPath: OLD, toPath: "/shop/definitely-not-a-real-slug-zzz" });
    expect(a.errors.some((e) => /doesn't resolve|broken/i.test(e))).toBe(true);
  });

  it("BLOCKS a redirect to a nonexistent SINGLE-SEGMENT CMS page slug (protects the production guard that exposed the bad test data)", async () => {
    // A single-segment destination is interpreted as a CMS page slug; when no such page exists it MUST be
    // rejected — this is exactly the correct production behaviour the old single-segment test paths tripped.
    const a = await svc.analyzeRedirect({ fromPath: VSRC, toPath: NONEXISTENT_PAGE });
    expect(a.errors.some((e) => /doesn't resolve|broken/i.test(e))).toBe(true);
    // …and it cannot be persisted even with confirmed:true (errors are not bypassable).
    const up = await svc.upsertRedirect({ fromPath: VSRC, toPath: NONEXISTENT_PAGE }, { confirmed: true });
    expect(up.ok).toBe(false);
    expect((await rest("redirects", `from_path=eq.${VSRC}&select=id`)).length).toBe(0); // nothing written
  });

  it("allows a valid live destination (a static storefront route)", async () => {
    const a = await svc.analyzeRedirect({ fromPath: OLD, toPath: "/shop" });
    expect(a.errors).toEqual([]);
  });

  it("requires confirmation when the SOURCE is a live route (redirect hides real content)", async () => {
    const a = await svc.analyzeRedirect({ fromPath: "/shop", toPath: "/about" });
    expect(a.confirmations.some((c) => /live page/i.test(c))).toBe(true);
  });

  it("upsert BLOCKS a live-source redirect until confirmed", async () => {
    const blocked = await svc.upsertRedirect({ fromPath: "/shop", toPath: "/about" }, {});
    expect(blocked.ok).toBe(false);
    expect(blocked.analysis?.confirmations.length).toBeGreaterThan(0);
    // (not asserting the confirmed path here — we don't want to actually redirect /shop in the shared DB)
  });

  it("detects a chain and resolves the final destination (warn + flatten)", async () => {
    // Self-contained: establish CMID→CFIN ourselves, then COLD→CMID chains through to CFIN.
    expect((await svc.upsertRedirect({ fromPath: CMID, toPath: CFIN }, { confirmed: true })).ok).toBe(true);
    const a = await svc.analyzeRedirect({ fromPath: COLD, toPath: CMID });
    expect(a.warnings.some((w) => new RegExp(`already redirects to ${CFIN}`, "i").test(w))).toBe(true);
    expect(a.finalDestination).toBe(CFIN);
  });

  it("BLOCKS an indirect loop against the live graph", async () => {
    // Self-contained: establish CMID→CFIN ourselves; adding CFIN→CMID would then loop.
    expect((await svc.upsertRedirect({ fromPath: CMID, toPath: CFIN }, { confirmed: true })).ok).toBe(true);
    const a = await svc.analyzeRedirect({ fromPath: CFIN, toPath: CMID });
    expect(a.errors.some((e) => /loop/i.test(e))).toBe(true);
  });
});

d("effective SEO resolver faithfulness (point 9, real DB)", () => {
  it("getEffectiveSeo reflects the SAME values as getRouteSeo, with provenance", async () => {
    await svc.upsertSeoOverride({ path: ROUTE, title: "IT Title", description: "IT Desc", canonical: "https://samorahstudio.com" + ROUTE, robots: "noindex" }, { actorId: undefined, confirmed: true });
    const eff = await svc.getEffectiveSeo(ROUTE);
    const resolved = await svc.getRouteSeo(ROUTE);
    expect(eff.title).toEqual({ value: "IT Title", provenance: "overridden" });
    expect(eff.title.value).toBe(resolved.title);
    expect(eff.robots.value).toBe("noindex");
    expect(eff.canonical.provenance).toBe("overridden");
  });

  it("after delete, the route reverts to inherited/site-default provenance", async () => {
    await svc.deleteSeoOverride(ROUTE);
    const eff = await svc.getEffectiveSeo(ROUTE);
    expect(eff.title.provenance).toBe("inherited-page"); // page supplies title; not fabricated
    expect(["site-default", "inherited-page"]).toContain(eff.description.provenance);
    expect(eff.robots).toEqual({ value: "index,follow", provenance: "not-overridden" });
  });
});
