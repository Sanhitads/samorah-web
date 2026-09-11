import { describe, it, expect } from "vitest";
import { buildChapterPage } from "@/lib/chapterPage";

/* eslint-disable @typescript-eslint/no-explicit-any */
const chapter = (seo_canonical?: string) => ({
  id: "c", name: "Dessert Chapter", slug: "dessert-chapter", volume: "Vol. I",
  is_coming_soon: false, products: [], seo_canonical,
});

describe("chapter page — admin canonical URL flows into the page SEO", () => {
  it("uses the collection's seo_canonical when set", () => {
    const page = buildChapterPage(chapter("https://samorahstudio.com/chapters/dessert-chapter") as any, [], {} as any, undefined);
    expect(page.seo.canonical).toBe("https://samorahstudio.com/chapters/dessert-chapter");
  });

  it("leaves canonical undefined when blank (page keeps its own URL)", () => {
    expect(buildChapterPage(chapter("") as any, [], {} as any, undefined).seo.canonical).toBeUndefined();
    expect(buildChapterPage(chapter(undefined) as any, [], {} as any, undefined).seo.canonical).toBeUndefined();
  });
});
