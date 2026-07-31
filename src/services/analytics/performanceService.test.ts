import { describe, it, expect } from "vitest";
import { cldBase, extractImages, summarizePerformance } from "./performanceService";
import type { ComposedSection } from "@/services/pageComposerService";

const RAW = "https://res.cloudinary.com/samorah/image/upload/v1/hero.jpg";
const CROPPED = "https://res.cloudinary.com/samorah/image/upload/c_fill,g_north,ar_16:9,f_auto,q_auto/v1/hero.jpg";

const sec = (id: string, type: string, settings: Record<string, unknown>, enabled = true): ComposedSection => ({ id, type, enabled, sortOrder: 0, settings });

describe("performanceService (Phase 6 · point 27)", () => {
  it("cldBase strips a Cloudinary transform back to the stored raw URL", () => {
    expect(cldBase(RAW)).toBe(RAW);
    expect(cldBase(CROPPED)).toBe(RAW);
    expect(cldBase("https://example.com/x.jpg")).toBe("https://example.com/x.jpg");
  });

  it("extractImages finds image URLs (nested), skips gradients/colours/videos + disabled sections", () => {
    const sections = [
      sec("s1", "hero", { heroImage: RAW, videoUrl: "https://cdn/x.mp4", theme: "dark" }),
      sec("s2", "content-blocks", { blocks: [{ _type: "image", image: "https://cdn/a.jpg" }, { _type: "image", image: "gradient:grad-chai" }, { _type: "image", image: "#f5f2ed" }] }),
      sec("s3", "brand-story", { image: "https://cdn/hidden.jpg" }, false), // disabled → skipped
    ];
    const imgs = extractImages(sections);
    const urls = imgs.map((i) => i.url).sort();
    expect(urls).toEqual(["https://cdn/a.jpg", RAW]); // no mp4, no gradient/#colour, no disabled
    expect(imgs.find((i) => i.url === CROPPED)).toBeUndefined();
  });

  it("cropped delivery URLs resolve to the stored raw base for sizing", () => {
    const imgs = extractImages([sec("s1", "hero", { heroImage: CROPPED })]);
    expect(imgs[0].base).toBe(RAW);
  });

  it("summarizePerformance totals weight, picks largest + heaviest section, estimates load, counts unknowns", () => {
    const perImage = [
      { url: "a.jpg", base: "a", section: "s1", sectionType: "hero" },
      { url: "b.jpg", base: "b", section: "s1", sectionType: "hero" },
      { url: "c.jpg", base: "c", section: "s2", sectionType: "brand-story" },
      { url: "d.jpg", base: "d", section: "s2", sectionType: "brand-story" }, // unknown size
    ];
    const size = new Map<string, number>([["a", 500_000], ["b", 300_000], ["c", 1_000_000]]);
    const p = summarizePerformance(perImage, size);
    expect(p.totalBytes).toBe(1_800_000);
    expect(p.knownImages).toBe(3);
    expect(p.unknownImages).toBe(1);
    expect(p.largest).toMatchObject({ url: "c.jpg", bytes: 1_000_000 });
    expect(p.heaviestSection).toMatchObject({ id: "s2", type: "brand-story", bytes: 1_000_000 });
    // 1.8MB over 4 Mbps ≈ 3.6s
    expect(p.estLoadMs).toBe(Math.round((1_800_000 * 8) / (4 * 1_000_000) * 1000));
    expect(p.assumedMbps).toBe(4);
  });
});
