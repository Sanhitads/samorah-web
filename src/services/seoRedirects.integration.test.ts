import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
const OLD = "/seo-it-old", MID = "/seo-it-mid", FIN = "/seo-it-final", ROUTE = "/seo-it-route";
const IDA = "/seo-it-id-a", IDA2 = "/seo-it-id-a2", IDB = "/seo-it-id-b";
const rest = (table: string, q: string) => fetch(`${URL}/rest/v1/${table}?${q}`, { headers: H }).then((r) => r.json());
const patch = (table: string, q: string, body: unknown) => fetch(`${URL}/rest/v1/${table}?${q}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body) });

beforeAll(async () => { if (RUN) svc = await import("@/services/seoRedirectService"); });
afterAll(async () => {
  if (!RUN) return;
  await del("redirects", `from_path=in.(${[OLD, MID, FIN, IDA, IDA2, IDB].join(",")})`);
  await del("seo_overrides", `path=eq.${ROUTE}`);
});

d("redirect editing preserves identity + re-validates the graph (P1)", () => {
  it("editing updates the row by id (id + hits preserved), never inserts a duplicate", async () => {
    expect((await svc.upsertRedirect({ fromPath: IDA, toPath: "/x" }, { confirmed: true })).ok).toBe(true);
    const created = (await rest("redirects", `from_path=eq.${IDA}&select=id,hits`))[0];
    await patch("redirects", `id=eq.${created.id}`, { hits: 7 }); // simulate accrued history

    // Edit the destination via update-by-id.
    expect((await svc.upsertRedirect({ id: created.id, fromPath: IDA, toPath: "/y" }, { confirmed: true })).ok).toBe(true);
    const afterEdit = (await rest("redirects", `from_path=eq.${IDA}&select=id,to_path,hits`))[0];
    expect(afterEdit.id).toBe(created.id);   // identity preserved
    expect(afterEdit.hits).toBe(7);          // history preserved (an insert would reset to 0)
    expect(afterEdit.to_path).toBe("/y");
    expect((await rest("redirects", `from_path=eq.${IDA}&select=id`)).length).toBe(1); // no duplicate row
  });

  it("editing the SOURCE path keeps the same id (identity), and re-runs graph validation", async () => {
    const row = (await rest("redirects", `from_path=eq.${IDA}&select=id`))[0];
    expect((await svc.upsertRedirect({ id: row.id, fromPath: IDA2, toPath: "/y" }, { confirmed: true })).ok).toBe(true);
    expect((await rest("redirects", `from_path=eq.${IDA}&select=id`)).length).toBe(0); // old source gone
    const moved = (await rest("redirects", `from_path=eq.${IDA2}&select=id`))[0];
    expect(moved.id).toBe(row.id); // same identity, source changed

    // A source edit that collides with another redirect's source is blocked by the graph analyzer.
    await svc.upsertRedirect({ fromPath: IDB, toPath: "/z" }, { confirmed: true });
    const collide = await svc.upsertRedirect({ id: moved.id, fromPath: IDB, toPath: "/y" }, { confirmed: true });
    expect(collide.ok).toBe(false);
    expect(collide.analysis?.errors.some((e) => /already sends/i.test(e))).toBe(true);
  });
});

d("redirect analysis + destination lifecycle (real DB)", () => {
  it("BLOCKS a nonexistent internal destination", async () => {
    const a = await svc.analyzeRedirect({ fromPath: OLD, toPath: "/shop/definitely-not-a-real-slug-zzz" });
    expect(a.errors.some((e) => /doesn't resolve|broken/i.test(e))).toBe(true);
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
    expect((await svc.upsertRedirect({ fromPath: MID, toPath: FIN }, { confirmed: true })).ok).toBe(true);
    const a = await svc.analyzeRedirect({ fromPath: OLD, toPath: MID });
    expect(a.warnings.some((w) => new RegExp(`already redirects to ${FIN}`, "i").test(w))).toBe(true);
    expect(a.finalDestination).toBe(FIN);
  });

  it("BLOCKS an indirect loop against the live graph", async () => {
    // MID→FIN exists; adding FIN→MID would loop.
    const a = await svc.analyzeRedirect({ fromPath: FIN, toPath: MID });
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
