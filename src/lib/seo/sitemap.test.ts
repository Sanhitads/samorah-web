import { describe, it, expect } from "vitest";
import { applySitemapSeo, isValidChangeFreq, isValidPriority, type SitemapEntry, type SeoOverrideLite } from "./sitemap";

const base: SitemapEntry[] = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/shop", changeFrequency: "weekly", priority: 0.8 },
  { path: "/shop/amber-oud", changeFrequency: "weekly", priority: 0.7 },
  { path: "/chapters/the-hours", changeFrequency: "monthly", priority: 0.6 },
];
const noRedirect = () => false;

describe("applySitemapSeo (points 15·16·17)", () => {
  it("keeps base defaults when there is no override", () => {
    const out = applySitemapSeo(base, [], noRedirect);
    expect(out).toHaveLength(4);
    expect(out.find((e) => e.path === "/shop")).toMatchObject({ priority: 0.8, changeFrequency: "weekly" });
  });

  it("applies a valid priority + changefreq override; keeps base for invalid values", () => {
    const ov: SeoOverrideLite[] = [
      { path: "/shop", robots: "", sitemapPriority: "0.9", changeFreq: "daily" },
      { path: "/shop/amber-oud", robots: "", sitemapPriority: "5", changeFreq: "often" }, // both invalid
    ];
    const out = applySitemapSeo(base, ov, noRedirect);
    expect(out.find((e) => e.path === "/shop")).toMatchObject({ priority: 0.9, changeFrequency: "daily" });
    expect(out.find((e) => e.path === "/shop/amber-oud")).toMatchObject({ priority: 0.7, changeFrequency: "weekly" }); // unchanged
  });

  it("EXCLUDES a route whose override robots is noindex", () => {
    const ov: SeoOverrideLite[] = [{ path: "/shop/amber-oud", robots: "noindex,follow", sitemapPriority: "", changeFreq: "" }];
    const out = applySitemapSeo(base, ov, noRedirect);
    expect(out.some((e) => e.path === "/shop/amber-oud")).toBe(false);
  });

  it("EXCLUDES a route that is an active redirect source", () => {
    const out = applySitemapSeo(base, [], (key) => key === "/shop/amber-oud");
    expect(out.some((e) => e.path === "/shop/amber-oud")).toBe(false);
    expect(out).toHaveLength(3);
  });

  it("folds home '' and an override stored as '/'", () => {
    const ov: SeoOverrideLite[] = [{ path: "/", robots: "noindex", sitemapPriority: "", changeFreq: "" }];
    const out = applySitemapSeo(base, ov, noRedirect);
    expect(out.some((e) => e.path === "")).toBe(false); // home excluded via the "/" override
  });

  it("deduplicates by normalized path (case/trailing slash)", () => {
    const dup: SitemapEntry[] = [...base, { path: "/Shop/", changeFrequency: "weekly", priority: 0.5 }];
    const out = applySitemapSeo(dup, [], noRedirect);
    expect(out.filter((e) => e.path.toLowerCase().replace(/\/$/, "") === "/shop")).toHaveLength(1);
  });
});

describe("noindex exclusion uses the canonical robots parser, not string equality (invariant C)", () => {
  const included = (robots: string) => applySitemapSeo(
    [{ path: "/shop/x", changeFrequency: "weekly", priority: 0.7 }],
    [{ path: "/shop/x", robots, sitemapPriority: "", changeFreq: "" }],
    () => false,
  ).some((e) => e.path === "/shop/x");

  it("EXCLUDES every noindex variant", () => {
    for (const r of ["noindex", "noindex,follow", "noindex,nofollow", "NOINDEX, FOLLOW", "follow,noindex"]) {
      expect(included(r), r).toBe(false);
    }
  });
  it("KEEPS indexable / default variants", () => {
    for (const r of ["", "index,follow", "index", "nofollow", "all"]) {
      expect(included(r), r).toBe(true);
    }
  });
});

describe("graceful fallback when DB-backed data can't load (invariant D)", () => {
  it("returns the base static routes unchanged (non-empty), exactly the catch-branch call", () => {
    // This is the exact expression sitemap.ts's catch uses: applySitemapSeo(base, [], () => false).
    const staticBase = [
      { path: "", changeFrequency: "weekly", priority: 1 },
      { path: "/shop", changeFrequency: "weekly", priority: 0.8 },
      { path: "/bundles", changeFrequency: "weekly", priority: 0.8 },
    ] as const;
    const out = applySitemapSeo([...staticBase], [], () => false);
    expect(out).toHaveLength(3);                    // non-empty — never a broken/empty sitemap
    expect(out.map((e) => e.path)).toEqual(["", "/shop", "/bundles"]);
    expect(out.find((e) => e.path === "")!.priority).toBe(1); // defaults preserved
  });
});

describe("sitemap validation helpers (point 23)", () => {
  it("priority must be 0–1", () => {
    expect(isValidPriority(0)).toBe(true);
    expect(isValidPriority(1)).toBe(true);
    expect(isValidPriority(0.5)).toBe(true);
    expect(isValidPriority(-0.1)).toBe(false);
    expect(isValidPriority(1.1)).toBe(false);
    expect(isValidPriority(NaN)).toBe(false);
  });
  it("changefreq must be a canonical value", () => {
    for (const v of ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]) expect(isValidChangeFreq(v)).toBe(true);
    expect(isValidChangeFreq("often")).toBe(false);
    expect(isValidChangeFreq("")).toBe(false);
  });
});
