import { describe, it, expect } from "vitest";
import { analyzeSeoOverride } from "./seoRedirectService";

/**
 * Service-level SEO-override analysis for the branches that need no DB (robots + canonical safety) —
 * points 6·7. Confirmation semantics (strong warning requiring explicit acknowledgement) vs plain
 * warnings vs hard blocks. (DB-backed branches — canonical→known-redirect, path lifecycle — are
 * exercised by seoRedirects.integration.test.ts.)
 */
describe("analyzeSeoOverride — robots + canonical safety (no DB)", () => {
  it("noindex on a MAJOR route requires explicit confirmation", async () => {
    const a = await analyzeSeoOverride({ path: "/", robots: "noindex" });
    expect(a.errors).toEqual([]);
    expect(a.confirmations.some((c) => /remove this major page/i.test(c))).toBe(true);
  });

  it("noindex on a minor route is only a warning, not a confirmation", async () => {
    const a = await analyzeSeoOverride({ path: "/some-minor-landing", robots: "noindex" });
    expect(a.confirmations).toEqual([]);
    expect(a.warnings.some((w) => /won't appear in search/i.test(w))).toBe(true);
  });

  it("a cross-domain canonical requires explicit confirmation (not a hard block)", async () => {
    const a = await analyzeSeoOverride({ path: "/x", canonical: "https://medium.com/@samorah/post" });
    expect(a.errors).toEqual([]);
    expect(a.confirmations.some((c) => /another domain/i.test(c))).toBe(true);
  });

  it("an unsafe/malformed canonical is a hard block", async () => {
    expect((await analyzeSeoOverride({ path: "/x", canonical: "javascript:alert(1)" })).errors.some((e) => /unsafe/i.test(e))).toBe(true);
    expect((await analyzeSeoOverride({ path: "/x", canonical: "not a url" })).errors.length).toBeGreaterThan(0);
  });

  it("noindex + canonical together is flagged as a conflicting-signal warning", async () => {
    const a = await analyzeSeoOverride({ path: "/x", canonical: "https://samorahstudio.com/x", robots: "noindex" });
    expect(a.warnings.some((w) => /can conflict/i.test(w))).toBe(true);
  });
});
