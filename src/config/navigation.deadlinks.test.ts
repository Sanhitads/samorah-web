import { describe, it, expect } from "vitest";
import { MENU_BRANCHES, FOOTER_SECTIONS } from "@/config/navigation";

/**
 * Navigation dead-link guard (SEO Phase 7). Every link the Mega Menu / footer actually renders must point
 * at a route that exists. Coming-soon items render as non-navigating labels (not <a href>), so they are
 * excluded. The two known 404s were `/collections` (no index page) and `/collections/the-hours` (no such
 * volume) — both must stay out of the real link set.
 */
function renderedHrefs(): string[] {
  const hrefs: string[] = [];
  for (const b of MENU_BRANCHES) {
    for (const it of b.items) if (it.href && !it.isComingSoon) hrefs.push(it.href);
    if (b.campaign?.href) hrefs.push(b.campaign.href);
  }
  for (const s of FOOTER_SECTIONS) for (const l of s.links) if (l.href) hrefs.push(l.href);
  return hrefs;
}

describe("navigation — no customer-facing dead links", () => {
  const hrefs = renderedHrefs();

  it("no rendered nav/footer link points at the /collections index (it has no page → 404)", () => {
    expect(hrefs).not.toContain("/collections");
  });

  it("no rendered nav/footer link points at /collections/the-hours (no such volume → 404)", () => {
    expect(hrefs).not.toContain("/collections/the-hours");
  });

  it("every Collections link resolves to a real volume route, not the umbrella/index", () => {
    const collectionLinks = hrefs.filter((h) => h.startsWith("/collections/"));
    expect(collectionLinks.length).toBeGreaterThan(0);
    for (const h of collectionLinks) {
      expect(h).not.toBe("/collections");
      expect(h).not.toBe("/collections/the-hours");
      expect(h).toMatch(/^\/collections\/[a-z-]+$/);
    }
  });
});
