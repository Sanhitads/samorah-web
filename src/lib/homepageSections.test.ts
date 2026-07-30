import { describe, it, expect } from "vitest";
import { chaptersFromSettings, experiencesFromSettings, editorialFromSettings } from "@/lib/homepageSections";
import { SECTION_DEFS } from "@/config/homepageSchemas";
import { resolveContent } from "@/lib/cms/sectionSchema";
import type { ComposedSection } from "@/services/pageComposerService";

/**
 * Homepage CMS — the three former "sourced" sections are now DB-editable blocks. These tests pin the
 * additive contract: with saved items the storefront renders them; with NO items it falls back to the
 * config catalogue (an un-edited homepage is unchanged); and the block schemas seed real defaults.
 */
const sec = (settings: Record<string, unknown>): ComposedSection => ({ id: "x", type: "x", enabled: true, sortOrder: 0, settings });

describe("homepage list-section resolvers", () => {
  it("chapters: no saved items ⇒ falls back to the config catalogue", () => {
    const out = chaptersFromSettings(sec({}));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].volume).toBeTruthy();
  });

  it("chapters: saved items map to typed HomeChapter cards (volume colour + link preserved)", () => {
    const out = chaptersFromSettings(sec({ items: [{ volume: "Volume IX", title: "Night Chapter", tagline: "After dark.", image: "gradient:grad-amethyst", slug: "night", ctaLabel: "Enter" }] }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ volume: "Volume IX", title: "Night Chapter", image: "gradient:grad-amethyst", slug: "night", ctaLabel: "Enter", isVisible: true });
  });

  it("atmosphere: saved items split the atmosphere words + assemble the scent journey", () => {
    const out = experiencesFromSettings(sec({ items: [{ title: "Velvet Hour", image: "https://x/v.jpg", atmosphereIndex: "Dusk\nVelvet\nQuiet", scentOpening: "A", scentUnfolding: "B", scentLingering: "C", ctaHref: "/shop/velvet-hour" }] }), "c1");
    expect(out).toHaveLength(1);
    expect(out[0].atmosphereIndex).toEqual(["Dusk", "Velvet", "Quiet"]);
    expect(out[0].scent).toEqual({ opening: "A", unfolding: "B", lingering: "C" });
    expect(out[0].image).toBe("https://x/v.jpg");
    expect(out[0].ctaHref).toBe("/shop/velvet-hour");
  });

  it("atmosphere: no items ⇒ config featured experiences", () => {
    expect(experiencesFromSettings(sec({}), "c1").length).toBeGreaterThan(0);
  });

  it("atmosphere: editable line colour + solid-colour image + tone flow through", () => {
    const out = experiencesFromSettings(sec({ items: [{ title: "T", image: "#123456", backgroundTone: "forest", lineColor: "#ff0000" }] }), "c1");
    expect(out[0].image).toBe("#123456");
    expect(out[0].backgroundTone).toBe("forest");
    expect(out[0].lineColor).toBe("#ff0000");
  });

  it("editorial-world: saved plate keeps its hover name + validates importance", () => {
    const out = editorialFromSettings(sec({ items: [{ title: "Morning Window", image: "gradient:grad-atm1", editorialImportance: "Opening" }, { title: "Bad Role", image: "x", editorialImportance: "Nonsense" }] }), "c1");
    expect(out[0]).toMatchObject({ title: "Morning Window", editorialImportance: "Opening" });
    expect(out[1].editorialImportance).toBe("Detail"); // invalid importance coerced to a safe default
    expect(out[1].imageAlt).toBe("Bad Role"); // alt falls back to the title
  });
});

describe("homepage section schemas", () => {
  it("the three former sourced sections now expose editable fields (not sourced)", () => {
    for (const t of ["chapters", "atmosphere", "editorial-world"] as const) {
      expect(SECTION_DEFS[t].schema.sourced).toBeFalsy();
      expect(SECTION_DEFS[t].schema.fields.length).toBeGreaterThan(0);
    }
  });

  it("brand-story schema now includes image + CTA + quote", () => {
    const keys = SECTION_DEFS["brand-story"].schema.fields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["image", "imageAlt", "ctaLabel", "ctaHref", "quote", "orientation"]));
  });

  it("chapters defaults seed a card per Volume with a gradient image", () => {
    const d = SECTION_DEFS.chapters.defaults("c1") as { items: { volume: string; image: string }[] };
    expect(d.items.length).toBeGreaterThan(0);
    expect(d.items[0].image).toMatch(/^gradient:|^https?:/);
  });

  it("resolveContent: saved settings override the config defaults for a blocks field", () => {
    const def = SECTION_DEFS.chapters;
    const resolved = resolveContent(def.schema, def.defaults("c1"), { items: [{ title: "Only One" }] });
    expect((resolved.items as unknown[]).length).toBe(1);
    expect((resolved.items as { title: string }[])[0].title).toBe("Only One");
  });
});
