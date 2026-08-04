import { describe, it, expect, vi } from "vitest";

/**
 * Navigation validation (Phase 1 · points 2·3·4). The DB lifecycle index + config entities are mocked
 * so the block/warn rules run deterministically: broken / archived / empty / structurally-invalid →
 * ERRORS (block publish); coming-soon items, duplicates, unknown custom routes → WARNINGS.
 */
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (t: string) => ({
      select: () => Promise.resolve({
        data: t === "cms_pages"
          ? [{ slug: "our-story", status: "published" }, { slug: "old-page", status: "archived" }]
          : t === "products"
            ? [{ slug: "amber-candle", status: "active" }, { slug: "gone-candle", status: "archived" }]
            : [],
      }),
      // navigation_menus.select(...).eq(...).maybeSingle() path (fetchLatest) — unused here.
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
    }),
  }),
}));
vi.mock("@/services/navigationService", () => ({
  resolveHref: (o: any) => (o.linkType === "entity" && o.entity
    ? ({ page: `/${o.entity.id}`, chapter: `/chapters/${o.entity.id}`, collection: `/collections/${o.entity.id}`, product: `/shop/${o.entity.id}` } as any)[o.entity.type] ?? "#"
    : o.href ?? "#"),
  listLinkableEntities: async () => ({ page: [{ id: "our-story" }], chapter: [{ id: "dessert-chapter" }], collection: [{ id: "the-everyday" }], product: [{ id: "amber-candle" }] }),
}));

import { validateMenu, sanitizeLabel } from "./navValidation";

const branch = (items: any[], over: any = {}) => ({ id: "shop", label: "Shop", items, campaign: { title: "C", eyebrow: "", description: "", href: "/collections/the-everyday", gradient: "grad-chai" }, ...over });
const hdr = (items: any[]) => validateMenu("header", [branch(items)]);

describe("sanitizeLabel", () => {
  it("strips HTML/script and collapses whitespace", () => {
    expect(sanitizeLabel("<b>Shop</b>  now")).toBe("Shop now");
    expect(sanitizeLabel("<script>alert(1)</script>Hi")).toBe("alert(1)Hi");
  });
});

describe("Nav validation — structural errors (block)", () => {
  it("empty menu blocks", async () => { expect((await validateMenu("header", [])).errors[0]).toMatch(/empty/); });
  it("empty branch blocks", async () => { expect((await hdr([])).errors.some((e) => /no links/.test(e))).toBe(true); });
  it("empty label blocks", async () => { expect((await hdr([{ label: "", href: "/shop" }])).errors.some((e) => /empty label/.test(e))).toBe(true); });
  it("empty destination blocks (non-coming-soon)", async () => {
    expect((await hdr([{ label: "Nowhere", href: "" }])).errors.some((e) => /no destination/.test(e))).toBe(true);
  });
  it("coming-soon item with no destination is allowed (no error)", async () => {
    const r = await hdr([{ label: "Soon", href: "", isComingSoon: true }]);
    expect(r.errors.some((e) => /no destination/.test(e))).toBe(false);
  });
});

describe("Nav validation — destination lifecycle", () => {
  it("BLOCKS an unresolvable internal URL (the /collections/typo case)", async () => {
    const r = await hdr([{ label: "Intimate", href: "/collections/the-intimatte" }]);
    expect(r.errors.some((e) => /does not resolve/.test(e))).toBe(true);
  });
  it("BLOCKS a broken entity link", async () => {
    const r = await hdr([{ label: "Ghost", linkType: "entity", entity: { type: "collection", id: "ghost" } }]);
    expect(r.errors.some((e) => /does not resolve/.test(e))).toBe(true);
  });
  it("BLOCKS an archived page destination", async () => {
    const r = await hdr([{ label: "Old", linkType: "entity", entity: { type: "page", id: "old-page" } }]);
    expect(r.errors.some((e) => /unavailable/.test(e))).toBe(true);
  });
  it("BLOCKS an archived (disabled) product destination", async () => {
    const r = await hdr([{ label: "Gone", href: "/shop/gone-candle" }]);
    expect(r.errors.some((e) => /unavailable/.test(e))).toBe(true);
  });
  it("a COMING-SOON item with a missing destination WARNS, does not block", async () => {
    const r = await hdr([{ label: "Vol III", href: "/collections/not-live-yet", isComingSoon: true }]);
    expect(r.errors.some((e) => /resolve/.test(e))).toBe(false);
    expect(r.warnings.some((w) => /resolve/.test(w))).toBe(true);
  });
  it("valid entity + valid URL destinations pass clean", async () => {
    const r = await hdr([
      { label: "Everyday", linkType: "entity", entity: { type: "collection", id: "the-everyday" } },
      { label: "Story", href: "/our-story" },
      { label: "Candle", href: "/shop/amber-candle" },
      { label: "Shop", href: "/shop" },
    ]);
    expect(r.errors).toEqual([]);
  });
  it("an unknown deep custom path WARNS (escape hatch), never blocks", async () => {
    const r = await hdr([{ label: "About story", href: "/about/our-story" }]);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => /custom or unknown/.test(w))).toBe(true);
  });
});

describe("Nav validation — hierarchy (block)", () => {
  it("a child with no parent above it blocks", async () => {
    const r = await hdr([{ label: "Orphan", href: "/shop", tier: "child" }]);
    expect(r.errors.some((e) => /has no parent/.test(e))).toBe(true);
  });
  it("a child after a parent is valid", async () => {
    const r = await hdr([{ label: "Parent", href: "/shop", tier: "parent" }, { label: "Kid", href: "/collections/the-everyday", tier: "child" }]);
    expect(r.errors.some((e) => /has no parent/.test(e))).toBe(false);
  });
});

describe("Nav validation — soft warnings (never block)", () => {
  it("duplicate URLs warn", async () => {
    const r = await hdr([{ label: "A", href: "/shop" }, { label: "B", href: "/shop" }]);
    expect(r.warnings.some((w) => /same URL/.test(w))).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it("duplicate label + identical destination in one branch warns (likely accidental)", async () => {
    const r = await hdr([{ label: "Shop", href: "/shop" }, { label: "Shop", href: "/shop" }]);
    expect(r.warnings.some((w) => /repeats/.test(w))).toBe(true);
  });
  it("labels are sanitized in the returned clean tree", async () => {
    const r = await hdr([{ label: "<b>Shop</b>", href: "/shop" }]);
    expect(r.clean[0].items[0].label).toBe("Shop");
  });
});
