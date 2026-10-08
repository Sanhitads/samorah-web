import { describe, it, expect } from "vitest";
import { SECTION_DEFS } from "@/config/homepageSchemas";
import { resolveContent, validateContent } from "@/lib/cms/sectionSchema";

/**
 * Homepage Hero — optional Secondary line + Secondary CTA (label + URL). These pin the additive
 * contract: the fields are exposed in the admin schema, seed blank defaults, flow through
 * resolveContent when saved, validate as a relative chapter URL, and — being optional — never make
 * an un-edited hero invalid.
 */
const hero = SECTION_DEFS.hero;

describe("hero schema — secondary line + secondary CTA", () => {
  it("exposes the three new editable fields", () => {
    const keys = hero.schema.fields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["secondaryLine", "secondaryCtaLabel", "secondaryCtaHref"]));
    // secondary CTA fields are NOT required (optional second button).
    for (const k of ["secondaryLine", "secondaryCtaLabel", "secondaryCtaHref"]) {
      expect(hero.schema.fields.find((f) => f.key === k)?.required).toBeFalsy();
    }
  });

  it("defaults seed the new keys as blank (un-edited hero shows nothing extra)", () => {
    const d = hero.defaults("c1") as Record<string, string>;
    expect(d.secondaryLine).toBe("");
    expect(d.secondaryCtaLabel).toBe("");
    expect(d.secondaryCtaHref).toBe("");
  });

  it("resolveContent flows saved secondary values over the defaults", () => {
    const resolved = resolveContent(hero.schema, hero.defaults("c1"), {
      secondaryLine: "Green Tea · Cardamom · Rose · Sweet Milk · Sandalwood",
      secondaryCtaLabel: "Explore the Chapter",
      secondaryCtaHref: "/chapters/dessert-chapter",
    });
    expect(resolved.secondaryLine).toBe("Green Tea · Cardamom · Rose · Sweet Milk · Sandalwood");
    expect(resolved.secondaryCtaLabel).toBe("Explore the Chapter");
    expect(resolved.secondaryCtaHref).toBe("/chapters/dessert-chapter");
  });

  it("a hero with a relative secondary chapter URL is valid", () => {
    const content = resolveContent(hero.schema, hero.defaults("c1"), {
      secondaryLine: "Green Tea · Cardamom · Rose",
      secondaryCtaLabel: "Explore the Chapter",
      secondaryCtaHref: "/chapters/dessert-chapter",
    });
    expect(validateContent(hero.schema, content)).toEqual([]);
  });

  it("an un-edited hero (blank secondary fields) stays valid", () => {
    const content = resolveContent(hero.schema, hero.defaults("c1"), {});
    expect(validateContent(hero.schema, content)).toEqual([]);
  });

  it("a malformed secondary URL is rejected", () => {
    const content = resolveContent(hero.schema, hero.defaults("c1"), { secondaryCtaHref: "not a url" });
    expect(validateContent(hero.schema, content).length).toBeGreaterThan(0);
  });
});
