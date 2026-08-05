import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Verification (SEO Phase 2 closure · invariant B): the sitemap's redirect-source exclusion uses ONLY
 * enabled redirects. getRedirectMap queries `redirects?enabled=eq.true`, so a DISABLED redirect can
 * never suppress an otherwise-valid sitemap route. Seed one enabled + one disabled redirect and prove
 * the map contains the enabled source and NOT the disabled one. Isolated file → fresh 60s cache.
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
const EN = "/seo-sm-enabled", DIS = "/seo-sm-disabled";

beforeAll(async () => {
  if (!RUN) return;
  await fetch(`${URL}/rest/v1/redirects`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify([
    { from_path: EN, to_path: "/x", code: 301, enabled: true },
    { from_path: DIS, to_path: "/y", code: 301, enabled: false },
  ]) });
});
afterAll(async () => { if (RUN) await fetch(`${URL}/rest/v1/redirects?from_path=in.(${EN},${DIS})`, { method: "DELETE", headers: H }); });

d("redirect-source exclusion uses only ENABLED redirects (invariant B)", () => {
  it("getRedirectMap contains the enabled source and NOT the disabled one", async () => {
    const { getRedirectMap, normalizePath } = await import("./redirects");
    const map = await getRedirectMap();
    expect(map.has(normalizePath(EN))).toBe(true);   // enabled → excluded from sitemap
    expect(map.has(normalizePath(DIS))).toBe(false); // disabled → must NOT suppress the route
  });
});
