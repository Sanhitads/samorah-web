import { describe, it, expect } from "vitest";
import { checkAccessibility, type A11ySection } from "./accessibilityCheck";
import type { SectionSchema } from "./sectionSchema";

const IMG = "https://res.cloudinary.com/x/image/upload/v1/a.jpg";
const labelOf = (t: string) => ({ hero: "Hero", card: "Card", blocks: "Editorial" }[t] ?? t);

const schemas: Record<string, SectionSchema> = {
  hero: { type: "hero", label: "Hero", note: "", fields: [{ key: "heading", label: "Headline", type: "text" }] },
  card: { type: "card", label: "Card", note: "", fields: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "image", label: "Image", type: "media" },
    { key: "imageAlt", label: "Alt", type: "text", altFor: "image" },
    { key: "ctaLabel", label: "Button", type: "text" },
    { key: "ctaHref", label: "URL", type: "url" },
    { key: "textColor", label: "Text", type: "color" },
    { key: "bgColor", label: "Bg", type: "color" },
  ] },
  blocks: { type: "blocks", label: "Editorial", note: "", fields: [
    { key: "blocks", label: "Blocks", type: "blocks", blockVariants: [
      { key: "heading", label: "Heading", fields: [{ key: "text", label: "Text", type: "text" }, { key: "level", label: "Lvl", type: "select" }] },
      { key: "image", label: "Image", fields: [{ key: "image", label: "Image", type: "media" }, { key: "alt", label: "Alt", type: "text", altFor: "image" }] },
    ] },
  ] },
};
const sec = (id: string, type: string, settings: Record<string, unknown>, enabled = true): A11ySection => ({ id, type, enabled, settings });
const rules = (issues: ReturnType<typeof checkAccessibility>) => issues.map((i) => i.rule);

describe("checkAccessibility (Phase 7 · point 32)", () => {
  it("flags a real image with no alt (and not when decorative or aliased)", () => {
    expect(rules(checkAccessibility([sec("s", "card", { image: IMG, imageAlt: "" })], schemas, labelOf))).toContain("alt");
    expect(rules(checkAccessibility([sec("s", "card", { image: IMG, imageAlt: "A candle" })], schemas, labelOf))).not.toContain("alt");
    expect(rules(checkAccessibility([sec("s", "card", { image: IMG, imageAlt: "", image__decorative: true })], schemas, labelOf))).not.toContain("alt");
  });

  it("flags a broken button (label, no href) and an empty link (href, no label)", () => {
    expect(rules(checkAccessibility([sec("s", "card", { ctaLabel: "Shop", ctaHref: "#" })], schemas, labelOf))).toContain("button");
    expect(rules(checkAccessibility([sec("s", "card", { ctaLabel: "", ctaHref: "/shop" })], schemas, labelOf))).toContain("link");
    expect(rules(checkAccessibility([sec("s", "card", { ctaLabel: "Shop", ctaHref: "/shop" })], schemas, labelOf))).not.toContain("button");
  });

  it("flags low text/background contrast (WCAG AA 4.5:1)", () => {
    expect(rules(checkAccessibility([sec("s", "card", { textColor: "#777777", bgColor: "#888888" })], schemas, labelOf))).toContain("contrast");
    expect(rules(checkAccessibility([sec("s", "card", { textColor: "#111111", bgColor: "#ffffff" })], schemas, labelOf))).not.toContain("contrast");
  });

  it("flags heading-hierarchy issues: missing H1, multiple H1, skipped level", () => {
    // no hero → no H1
    expect(rules(checkAccessibility([sec("s", "card", { heading: "About" })], schemas, labelOf))).toContain("heading");
    // two hero H1s
    const two = checkAccessibility([sec("h1", "hero", { heading: "A" }), sec("h2", "hero", { heading: "B" })], schemas, labelOf);
    expect(two.some((i) => i.rule === "heading" && /More than one H1/.test(i.message))).toBe(true);
    // H1 then an H3 block → skip
    const skip = checkAccessibility([sec("h", "hero", { heading: "A" }), sec("b", "blocks", { blocks: [{ _type: "heading", text: "Sub", level: "h3" }] })], schemas, labelOf);
    expect(skip.some((i) => /jumps from H1 to H3/.test(i.message))).toBe(true);
  });

  it("a clean page yields no issues; disabled sections are ignored", () => {
    const clean = checkAccessibility([
      sec("h", "hero", { heading: "Welcome" }),
      sec("c", "card", { heading: "Story", image: IMG, imageAlt: "A candle", ctaLabel: "Shop", ctaHref: "/shop" }),
      sec("d", "card", { image: IMG, imageAlt: "" }, false), // disabled → skipped
    ], schemas, labelOf);
    expect(clean).toHaveLength(0);
  });
});
