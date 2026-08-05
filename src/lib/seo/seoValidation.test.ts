import { describe, it, expect } from "vitest";
import { parseRobots, buildRobots, isNoindex, isMajorRoute, validatePathStructure, validateCanonical, titleGuidance, descriptionGuidance } from "./seoValidation";

describe("robots controls ⇄ canonical string (point 6)", () => {
  it("parses defaults and directives", () => {
    expect(parseRobots("")).toMatchObject({ index: true, follow: true, extra: [] });
    expect(parseRobots("noindex,nofollow")).toMatchObject({ index: false, follow: false });
    expect(parseRobots("index,follow")).toMatchObject({ index: true, follow: true });
  });
  it("preserves advanced directives through a round-trip", () => {
    const c = parseRobots("noindex,noarchive,nosnippet");
    expect(c.index).toBe(false);
    expect(c.extra).toEqual(["noarchive", "nosnippet"]);
    expect(buildRobots(c)).toBe("noindex,noarchive,nosnippet");
  });
  it("builds '' (default indexable) for index+follow, and noindex/nofollow otherwise", () => {
    expect(buildRobots({ index: true, follow: true, extra: [] })).toBe("");
    expect(buildRobots({ index: false, follow: true, extra: [] })).toBe("noindex");
    expect(buildRobots({ index: true, follow: false, extra: [] })).toBe("nofollow");
    expect(buildRobots({ index: false, follow: false, extra: [] })).toBe("noindex,nofollow");
  });
  it("isNoindex detects removal from search", () => {
    expect(isNoindex("noindex,follow")).toBe(true);
    expect(isNoindex("")).toBe(false);
  });
});

describe("isMajorRoute (point 6 — noindex warning targets)", () => {
  it("flags home, listing pages, and entity pages", () => {
    for (const p of ["/", "/shop", "/shop/amber-oud", "/collections/the-hours", "/about"]) expect(isMajorRoute(p)).toBe(true);
  });
  it("does not flag minor/utility routes", () => {
    for (const p of ["/faq", "/account/orders", "/some-landing"]) expect(isMajorRoute(p)).toBe(false);
  });
});

describe("validatePathStructure (points 1·3)", () => {
  it("blocks malformed paths", () => {
    expect(validatePathStructure("/a b").error).toBeTruthy();
    expect(validatePathStructure("/a\\b").error).toBeTruthy();
    expect(validatePathStructure("/a/../b").error).toBeTruthy();
  });
  it("blocks unsafe protocols always", () => {
    expect(validatePathStructure("javascript:alert(1)", { allowExternal: true }).error).toMatch(/unsafe/i);
  });
  it("blocks protocol-relative URLs (//example.com) even when external is allowed", () => {
    expect(validatePathStructure("//example.com/x", { allowExternal: true }).error).toMatch(/protocol-relative/i);
    expect(validatePathStructure("//evil.com").error).toMatch(/protocol-relative/i);
  });
  it("blocks external URLs unless allowed", () => {
    expect(validatePathStructure("https://x.com", {}).error).toMatch(/aren't allowed/i);
    expect(validatePathStructure("https://x.com", { allowExternal: true }).error).toBeUndefined();
  });
  it("requires internal paths to start with /", () => {
    expect(validatePathStructure("foo").error).toMatch(/absolute/i);
    expect(validatePathStructure("/foo").error).toBeUndefined();
  });
  it("warns when a redirect source carries a query/hash (middleware matches path only)", () => {
    expect(validatePathStructure("/old?ref=x", { role: "source" }).warn).toMatch(/query\/hash/i);
  });
});

describe("validateCanonical (point 7)", () => {
  const HOST = "samorahstudio.com";
  it("allows same-domain absolute and relative", () => {
    expect(validateCanonical("/shop/x", HOST)).toEqual({});
    expect(validateCanonical("https://samorahstudio.com/shop/x", HOST)).toEqual({});
    expect(validateCanonical("https://www.samorahstudio.com/shop/x", HOST)).toEqual({}); // www-insensitive
  });
  it("warns (not blocks) on a cross-domain canonical", () => {
    const r = validateCanonical("https://medium.com/@samorah/post", HOST);
    expect(r.crossDomain).toBe(true);
    expect(r.warn).toMatch(/different domain/i);
    expect(r.error).toBeUndefined();
  });
  it("blocks unsafe or malformed canonicals", () => {
    expect(validateCanonical("javascript:alert(1)", HOST).error).toMatch(/unsafe/i);
    expect(validateCanonical("not a url", HOST).error).toBeTruthy();
    expect(validateCanonical("ht!tp://x", HOST).error).toBeTruthy();
  });
  it("empty canonical is fine (inherits)", () => {
    expect(validateCanonical("", HOST)).toEqual({});
  });
});

describe("length guidance is advisory, not blocking (point 8)", () => {
  it("title guidance tiers", () => {
    expect(titleGuidance(0)).toBeNull();
    expect(titleGuidance(10)!.text).toMatch(/short/i);
    expect(titleGuidance(45)!).toMatchObject({ level: "info" });
    expect(titleGuidance(80)!).toMatchObject({ level: "warn" });
  });
  it("description guidance tiers", () => {
    expect(descriptionGuidance(50)!.text).toMatch(/short/i);
    expect(descriptionGuidance(120)!).toMatchObject({ level: "info" });
    expect(descriptionGuidance(200)!).toMatchObject({ level: "warn" });
  });
});
