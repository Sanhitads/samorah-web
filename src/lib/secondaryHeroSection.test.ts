import { describe, it, expect } from "vitest";
import { SECTION_DEFS } from "@/config/homepageSchemas";
import { SECTION_TYPES, DEFAULT_ORDER, SECTION_META } from "@/services/homepageService";
import { resolveContent, validateContent } from "@/lib/cms/sectionSchema";

/**
 * Secondary Hero section — a second hero slide. These pin: it is a real, addable section type with
 * FULL parity to the primary Hero's fields (plus a Visible toggle), it is NOT part of the default
 * homepage (so an un-edited homepage is unchanged), and its content validates like a hero.
 */
const hero = SECTION_DEFS.hero;
const secondary = SECTION_DEFS["secondary-hero"];

describe("secondary-hero section definition", () => {
  it("is a registered add-on type but NOT in the default homepage order", () => {
    expect(SECTION_TYPES).toContain("secondary-hero");
    expect(DEFAULT_ORDER as readonly string[]).not.toContain("secondary-hero");
    expect(SECTION_META["secondary-hero"].label).toBe("Secondary Hero");
  });

  it("has EVERY primary-hero field (parity) plus a `visible` boolean", () => {
    const heroKeys = hero.schema.fields.map((f) => f.key);
    const secKeys = secondary.schema.fields.map((f) => f.key);
    expect(secKeys).toEqual(expect.arrayContaining(heroKeys)); // full parity
    expect(secKeys).toContain("visible");
    const visible = secondary.schema.fields.find((f) => f.key === "visible");
    expect(visible?.type).toBe("boolean");
    expect(visible?.default).toBe(true);
    // Parity includes the secondary line + secondary CTA added to the hero.
    expect(secKeys).toEqual(expect.arrayContaining(["secondaryLine", "secondaryCtaLabel", "secondaryCtaHref"]));
  });

  it("defaults seed visible=true and carry the hero defaults", () => {
    const d = secondary.defaults("c1") as Record<string, unknown>;
    expect(d.visible).toBe(true);
    expect(d.heading).toBeTruthy(); // seeded from the active campaign, like the hero
  });

  it("validates like a hero (valid content → no errors; placeholder headline → rejected)", () => {
    const ok = resolveContent(secondary.schema, secondary.defaults("c1"), { heading: "A Second Opening", secondaryCtaHref: "/chapters/dessert-chapter" });
    expect(validateContent(secondary.schema, ok)).toEqual([]);
    const bad = resolveContent(secondary.schema, secondary.defaults("c1"), { heading: "headline" });
    expect(validateContent(secondary.schema, bad).length).toBeGreaterThan(0);
  });
});
