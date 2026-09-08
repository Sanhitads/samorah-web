import { describe, it, expect } from "vitest";
import { buildCandleEditorial, applyCandleViewOverrides, CANDLE_SECTION_POSITIONS, type CandlePdpContent } from "@/lib/productEditorial";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Minimal candle view fixture — only the fields buildCandleEditorial reads.
function makeView(over: Record<string, unknown> = {}): any {
  return {
    name: "Whispered Flame",
    slug: "whispered-flame",
    chapterName: "Vol. III — Mood Library",
    chapterSlug: "mood-library",
    scentGroup: "Sweet · Spiced Floral · Leather",
    mood: { tags: [], persona: "The Confidant", story: "", cultural: "", lifestyle: "" },
    notes: [],
    vessels: [],
    details: [],
    gallery: [{ src: "gradient:grad-amethyst", alt: "Whispered Flame" }],
    ...over,
  };
}
const build = (content: CandlePdpContent) => buildCandleEditorial({ view: makeView(), artist: null as any, related: [], content });
const section = (secs: any[], id: string) => secs.find((s) => s.id === id);
const cardsOf = (secs: any[]) => (section(secs, "mood").settings as any).cards as { label: string; value: string }[];

describe("PDP character grid — custom cards near Theme", () => {
  it("adds both custom cards AFTER the Theme card when set + shown", () => {
    const cards = cardsOf(build({
      moodCard1Label: "Mood", moodCard1Value: "Loved & Romantic",
      moodCard2Label: "Character", moodCard2Value: "Melancholy",
    }));
    const themeIdx = cards.findIndex((c) => c.label === "Theme");
    expect(cards.find((c) => c.value === "Loved & Romantic")).toEqual({ label: "Mood", value: "Loved & Romantic" });
    expect(cards.find((c) => c.value === "Melancholy")).toEqual({ label: "Character", value: "Melancholy" });
    expect(cards.findIndex((c) => c.value === "Loved & Romantic")).toBeGreaterThan(themeIdx);
    expect(cards.findIndex((c) => c.value === "Melancholy")).toBeGreaterThan(themeIdx);
  });

  it("hides a card when its Show is off (hidden flag) even if it has a value", () => {
    const cards = cardsOf(build({ moodCard1Value: "Loved & Romantic", moodCard1Hidden: true }));
    expect(cards.some((c) => c.value === "Loved & Romantic")).toBe(false);
  });

  it("omits a card with no value (a theme without categorisation shows nothing extra)", () => {
    const cards = cardsOf(build({ moodCard1Value: "  ", moodCard2Value: "" }));
    expect(cards.map((c) => c.label)).toEqual(["Flame Persona", "Scent Group", "Theme"]);
  });

  it("falls back to a default label when the label is blank", () => {
    const cards = cardsOf(build({ moodCard1Value: "Loved & Romantic" }));
    expect(cards.some((c) => c.label === "Mood" && c.value === "Loved & Romantic")).toBe(true);
  });
});

describe("Mood within the theme — same-row in two places, each show/hide", () => {
  const themeCard = (content: CandlePdpContent) => cardsOf(build(content)).find((c) => c.label === "Theme") as { label: string; value: string; sub?: string };

  it("Theme card shows the mood as an in-row second value (sub) when set + shown", () => {
    expect(themeCard({ themeMood: "Loved & Romantic" })).toEqual({ label: "Theme", value: "Mood Library", sub: "Loved & Romantic" });
  });

  it("Theme card hides the mood (no sub) when 'By Theme card' is off", () => {
    expect(themeCard({ themeMood: "Loved & Romantic", hideThemeMoodTheme: true }).sub).toBeUndefined();
  });

  it("hero eyebrow gets p.themeMood when shown, and null when hidden or blank", () => {
    const view = () => ({ chapterName: "Vol. III — Mood Library", variants: [] } as any);
    expect(applyCandleViewOverrides(view(), { themeMood: "Loved & Romantic" }).themeMood).toBe("Loved & Romantic");
    expect(applyCandleViewOverrides(view(), { themeMood: "Loved & Romantic", hideThemeMoodTop: true }).themeMood).toBeNull();
    expect(applyCandleViewOverrides(view(), { themeMood: "   " }).themeMood).toBeNull();
  });

  it("the two placements toggle independently", () => {
    // shown at top only
    expect(applyCandleViewOverrides({ chapterName: "Vol. III — Mood Library", variants: [] } as any, { themeMood: "X", hideThemeMoodTheme: true }).themeMood).toBe("X");
    expect(themeCard({ themeMood: "X", hideThemeMoodTheme: true }).sub).toBeUndefined();
    // shown by Theme card only
    expect(themeCard({ themeMood: "X", hideThemeMoodTop: true }).sub).toBe("X");
    expect(applyCandleViewOverrides({ chapterName: "Vol. III — Mood Library", variants: [] } as any, { themeMood: "X", hideThemeMoodTop: true }).themeMood).toBeNull();
  });
});

describe("Continue rail — collection-type label (Core / Limited …)", () => {
  const railCards = (related: any[]) => {
    const s = buildCandleEditorial({ view: makeView(), artist: null as any, related, content: {} }).find((x) => x.id === "related");
    return (s!.settings as any).products as { slug: string; collectionType?: string }[];
  };
  it("shows the product's own collection type (e.g. Limited Collection), not a hardcoded Core", () => {
    const [card] = railCards([{ slug: "exotic", name: "Exotic", price: 520, collectionType: "Limited Collection", variants: [{ price: 520, is_active: true }] }]);
    expect(card.collectionType).toBe("Limited Collection");
  });
  it("defaults to Core Collection only when the product genuinely has none", () => {
    const [card] = railCards([{ slug: "x", name: "X", price: 500, variants: [{ price: 500, is_active: true }] }]);
    expect(card.collectionType).toBe("Core Collection");
  });
});

describe("custom section position — 'After Cultural Reference'", () => {
  const orderOf = (secs: any[], id: string) => secs.find((s) => s.id === id)?.order as number;

  it("the dropdown includes an 'After Cultural Reference' option", () => {
    const opt = CANDLE_SECTION_POSITIONS.find((p) => p.value === "after-cultural");
    expect(opt).toBeTruthy();
    expect(opt!.label).toBe("After Cultural Reference");
  });

  it("does not remove or renumber any existing position", () => {
    const byValue = Object.fromEntries(CANDLE_SECTION_POSITIONS.map((p) => [p.value, p.order]));
    // every previously-existing option is still present with its original order
    expect(byValue).toMatchObject({
      top: 0.5, "after-story": 1.5, "after-journey": 2.5, "after-mood": 4.5, "after-craft": 5.5,
      "after-artist": 8.5, "after-lifestyle": 9.5, "after-testimonials": 11.5, end: 14.5,
    });
  });

  it("a custom section positioned 'after-cultural' orders AFTER Cultural Reference and BEFORE In Their Words", () => {
    const content: CandlePdpContent = { customSections: [{ type: "quote", position: "after-cultural", body: "A note about the market." }] as any };
    const secs = buildCandleEditorial({
      view: makeView({ mood: { tags: [], persona: "P", story: "s", cultural: "Khari Baoli, Old Delhi", lifestyle: "L" } }),
      artist: null as any, related: [], content,
    });
    const custom = orderOf(secs, "candle-custom-0");
    expect(custom).toBeGreaterThan(orderOf(secs, "cultural"));   // after Cultural Reference (order 10)
    expect(custom).toBeLessThan(orderOf(secs, "testimonials"));  // before In Their Words (order 11)
  });
});

describe("character grid — duplicate labels are allowed (no key collision)", () => {
  it("an auto 'Mood' card and a custom 'Mood' card can co-exist", () => {
    const cards = cardsOf(buildCandleEditorial({
      view: makeView({ mood: { tags: ["Warm", "Cozy"], persona: "The Confidant", story: "", cultural: "", lifestyle: "" } }),
      artist: null as any, related: [], content: { moodCard1Label: "Mood", moodCard1Value: "Loved & Romantic" },
    }));
    expect(cards.filter((c) => c.label === "Mood")).toHaveLength(2); // rendered with index-based keys, no collision
  });
});

describe("PDP 'In their words' — show/hide", () => {
  const withQuote: CandlePdpContent = { testimonials: [{ quote: "A lovely candle.", attribution: "Aditi, Mumbai" }] };

  it("is visible when it has quotes and is not hidden", () => {
    expect(section(build(withQuote), "testimonials").visibility).toBe(true);
  });

  it("is hidden when hideTestimonials is set — even with quotes", () => {
    expect(section(build({ ...withQuote, hideTestimonials: true }), "testimonials").visibility).toBe(false);
  });

  it("carries the admin font colour through to the section settings", () => {
    const s = section(build({ ...withQuote, testimonialColor: "#FAF7F2" }), "testimonials");
    expect((s.settings as any).color).toBe("#FAF7F2");
  });
});
