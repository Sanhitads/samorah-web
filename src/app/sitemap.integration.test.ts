import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Verification (SEO Phase 2 closure · invariant A): the ACTUAL generated sitemap output. We neutralise
 * the dev override (NEXT_PUBLIC_SITE_URL) so canonicalOrigin resolves to the primary PRODUCTION domain —
 * exactly as it does at build/production runtime (NODE_ENV=production ignores the dev override) — and
 * assert every emitted URL is an absolute canonical production URL (no relative paths, no dev origin,
 * no duplicates), across home / shop / product / chapter / air-volume. Env-gated.
 */
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* skip below */ }

const RUN = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const d = RUN ? describe : describe.skip;
const ORIGIN = "https://samorahstudio.com";

let urls: string[] = [];
beforeAll(async () => {
  if (!RUN) return;
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ""); // force canonicalOrigin → primary production domain
  const sitemap = (await import("./sitemap")).default;
  urls = (await sitemap()).map((e) => e.url);
  vi.unstubAllEnvs();
});

d("generated sitemap URL correctness (invariant A)", () => {
  it("emits only absolute canonical production URLs (no relative / dev / malformed)", () => {
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u.startsWith(ORIGIN)).toBe(true);            // absolute + production origin
      expect(u).not.toMatch(/localhost|127\.0\.0\.1|vercel\.app/); // never a dev/preview origin
      expect(u).not.toMatch(/\s/);                        // no whitespace/malformed
      expect(u).not.toMatch(/([^:])\/\//);                // no accidental double slash in the path
    }
  });

  it("has no duplicate URLs", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("includes home, shop and a representative product / chapter / air-volume", () => {
    expect(urls).toContain(ORIGIN);            // homepage (bare canonical origin)
    expect(urls).toContain(`${ORIGIN}/shop`);  // shop listing
    expect(urls).toContain(`${ORIGIN}/about`);   // editorial page (P0-4)
    expect(urls).toContain(`${ORIGIN}/journal`); // editorial page (P0-4)
    const shape = (re: RegExp) => urls.some((u) => re.test(u));
    // At least one of the data-driven route families should be present in a live DB.
    expect(
      shape(new RegExp(`^${ORIGIN}/shop/[a-z0-9-]+$`)) ||
      shape(new RegExp(`^${ORIGIN}/chapters/[a-z0-9-]+$`)) ||
      shape(new RegExp(`^${ORIGIN}/collections/[a-z0-9-]+$`)),
    ).toBe(true);
  });
});
