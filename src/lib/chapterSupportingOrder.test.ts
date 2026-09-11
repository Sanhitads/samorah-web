import { describe, it, expect } from "vitest";
import { selectSupporting, type ChapterProductInput } from "@/lib/chapterPage";

/**
 * The "Also in this chapter" rail is NUMBERED by the admin's chapter_position (NO. III.2, III.3, …).
 * Its default (curated) order must therefore READ in that same sequence — not the DB's arbitrary
 * embed order. Regression guard for mood-library rendering III.3 (Exotic) before III.2 (Rainforest).
 */
const p = (id: string, over: Partial<ChapterProductInput> = {}): ChapterProductInput => ({
  id, slug: id, name: id, price: 500, ...over,
});

describe("selectSupporting — default order follows chapter_position", () => {
  it("orders positioned products ascending, regardless of input order", () => {
    // Arrive in reversed embed order (the bug): Exotic(3) before Rainforest(2).
    const products = [
      p("exotic", { chapter_position: "3" }),
      p("rainforest", { chapter_position: "2" }),
    ];
    const out = selectSupporting(products, null, {});
    expect(out.map((x) => x.slug)).toEqual(["rainforest", "exotic"]); // III.2 then III.3
  });

  it("keeps unpositioned products in input order, after the numbered ones", () => {
    const products = [
      p("unposed-a"),
      p("three", { chapter_position: "3" }),
      p("unposed-b"),
      p("two", { chapter_position: "2" }),
    ];
    const out = selectSupporting(products, null, {});
    expect(out.map((x) => x.slug)).toEqual(["two", "three", "unposed-a", "unposed-b"]);
  });

  it("does not override an explicit sort strategy (e.g. alphabetical)", () => {
    const products = [p("b", { chapter_position: "1" }), p("a", { chapter_position: "2" })];
    const out = selectSupporting(products, null, { sort: "alphabetical" });
    expect(out.map((x) => x.slug)).toEqual(["a", "b"]); // name order, not position order
  });

  it("still hides the hero", () => {
    const hero = p("hero", { chapter_position: "1" });
    const products = [hero, p("two", { chapter_position: "2" })];
    const out = selectSupporting(products, hero, {});
    expect(out.map((x) => x.slug)).toEqual(["two"]);
  });
});
