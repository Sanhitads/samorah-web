import { describe, it, expect } from "vitest";
import { buildCandleEditorial, type CandlePdpContent } from "@/lib/productEditorial";

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
