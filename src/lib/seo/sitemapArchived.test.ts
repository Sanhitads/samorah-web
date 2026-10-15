import { describe, it, expect } from "vitest";
import { indexableArchivedProducts } from "@/lib/seo/sitemap";

/**
 * Archive sitemap eligibility (item 2). Input rows are already status='archived' (so drafts / unpublished
 * never reach this helper). A genuinely-published, still-visible, non-coming-soon archived product keeps
 * its historic /shop/[slug] (200, self-canonical, indexable) and therefore belongs in the sitemap; hidden,
 * coming-soon, and slug-less rows do not.
 */
describe("indexableArchivedProducts", () => {
  const rows = [
    { slug: "retired-published", is_coming_soon: false, visible_website: true },
    { slug: "retired-default-visibility", is_coming_soon: false }, // visible_website undefined → still eligible
    { slug: "retired-hidden", is_coming_soon: false, visible_website: false }, // hidden → excluded
    { slug: "retired-coming-soon", is_coming_soon: true, visible_website: true }, // coming-soon → excluded
    { slug: "", is_coming_soon: false, visible_website: true }, // no slug → excluded
  ];

  it("includes published, visible, non-coming-soon products (unset visibility counts as visible)", () => {
    expect(indexableArchivedProducts(rows).map((r) => r.slug)).toEqual(["retired-published", "retired-default-visibility"]);
  });

  it("excludes hidden, coming-soon and slug-less rows", () => {
    const slugs = indexableArchivedProducts(rows).map((r) => r.slug);
    expect(slugs).not.toContain("retired-hidden");
    expect(slugs).not.toContain("retired-coming-soon");
    expect(slugs).not.toContain("");
  });

  it("empty / nullish input → empty (an empty Archive stays out of the sitemap)", () => {
    expect(indexableArchivedProducts([])).toEqual([]);
    expect(indexableArchivedProducts(undefined as unknown as [])).toEqual([]);
  });
});
