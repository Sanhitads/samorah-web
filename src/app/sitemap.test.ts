import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";

/**
 * Sitemap inclusion/exclusion (SEO Phase 11). The route's try/catch guarantees at least the static base
 * (home, shop, bundles, the editorial/service pages, air collections) even if the DB is unavailable, so
 * these presence/absence assertions hold regardless of environment. The dynamic additions (products,
 * chapters, populated archive) only ADD entries and never violate the exclusions below.
 */
describe("sitemap — only indexable, canonical, public URLs", () => {
  it("includes the editorial/service pages and excludes private / noindex / 404 routes", async () => {
    const entries = await sitemap();
    const paths = entries.map((e) => new URL(e.url).pathname);

    // Indexable editorial / brand / support + policy pages are present.
    for (const p of ["/", "/shop", "/bundles", "/our-story", "/craft-materials", "/the-people-behind-samorah", "/product-care", "/faq", "/contact", "/shipping", "/returns-policy"]) {
      expect(paths, `expected ${p} in sitemap`).toContain(p);
    }

    // Private / noindex / orphan / non-existent routes are absent.
    for (const p of ["/about", "/journal", "/privacy", "/terms", "/login", "/register", "/wishlist", "/cart", "/checkout", "/account", "/collections"]) {
      expect(paths, `expected ${p} NOT in sitemap`).not.toContain(p);
    }

    // Products appear only as the canonical /shop/<slug> — never the legacy /products/<slug>.
    expect(paths.some((p) => p.startsWith("/products/"))).toBe(false);
    // No preview tooling routes.
    expect(paths.some((p) => p.endsWith("-preview"))).toBe(false);
  });
});
