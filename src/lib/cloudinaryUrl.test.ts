import { describe, it, expect } from "vitest";
import { isCloudinary, cldUrl, cldSrcSet, cldBlur, cldCrop, focalGravity, CLD_WIDTHS } from "./cloudinaryUrl";

const RAW = "https://res.cloudinary.com/samorah/image/upload/v1710000000/products/kashmiri-chai.jpg";

describe("cloudinaryUrl", () => {
  it("detects Cloudinary upload URLs", () => {
    expect(isCloudinary(RAW)).toBe(true);
    expect(isCloudinary("https://example.com/x.jpg")).toBe(false);
    expect(isCloudinary("gradient:grad-chai")).toBe(false);
    expect(isCloudinary(null)).toBe(false);
  });

  it("injects f_auto,q_auto,c_limit(,w_n) after /upload/", () => {
    expect(cldUrl(RAW)).toBe("https://res.cloudinary.com/samorah/image/upload/f_auto,q_auto,c_limit/v1710000000/products/kashmiri-chai.jpg");
    expect(cldUrl(RAW, 640)).toBe("https://res.cloudinary.com/samorah/image/upload/f_auto,q_auto,c_limit,w_640/v1710000000/products/kashmiri-chai.jpg");
  });

  it("passes non-Cloudinary URLs through untouched", () => {
    expect(cldUrl("https://example.com/x.jpg", 640)).toBe("https://example.com/x.jpg");
    expect(cldUrl("gradient:grad-chai")).toBe("gradient:grad-chai");
  });

  it("never double-transforms an already-transformed URL", () => {
    const already = "https://res.cloudinary.com/samorah/image/upload/f_auto,q_auto,w_800/v1/products/x.jpg";
    expect(cldUrl(already, 640)).toBe(already); // path doesn't start with v\\d+ → left alone
  });

  it("builds a responsive srcSet across all widths", () => {
    const set = cldSrcSet(RAW);
    expect(set).toBeDefined();
    const entries = set!.split(", ");
    expect(entries).toHaveLength(CLD_WIDTHS.length);
    expect(entries[0]).toMatch(/w_384\/.*384w$/);
    expect(entries.at(-1)).toMatch(/w_2048\/.*2048w$/);
    for (const e of entries) expect(e).toContain("f_auto,q_auto,c_limit");
    expect(cldSrcSet("https://example.com/x.jpg")).toBeUndefined();
  });

  it("builds a tiny blur LQIP url for Cloudinary images only", () => {
    expect(cldBlur(RAW)).toBe("https://res.cloudinary.com/samorah/image/upload/e_blur:2000,q_30,w_24,c_limit,f_auto/v1710000000/products/kashmiri-chai.jpg");
    expect(cldBlur("https://example.com/x.jpg")).toBeUndefined();
    expect(cldBlur("gradient:grad-chai")).toBeUndefined();
  });

  it("maps a focal point to a compass gravity (Phase 5 #21)", () => {
    expect(focalGravity(null, null)).toBe("auto");
    expect(focalGravity(0.5, 0.5)).toBe("center");
    expect(focalGravity(0.1, 0.1)).toBe("north_west");
    expect(focalGravity(0.9, 0.9)).toBe("south_east");
    expect(focalGravity(0.5, 0.1)).toBe("north");
    expect(focalGravity(0.9, 0.5)).toBe("east");
  });

  it("bakes a focal-aware crop into the URL (c_fill,g_*,ar_*)", () => {
    expect(cldCrop(RAW, { ar: "16:9", focalX: 0.5, focalY: 0.2 }))
      .toBe("https://res.cloudinary.com/samorah/image/upload/c_fill,g_north,ar_16:9,f_auto,q_auto/v1710000000/products/kashmiri-chai.jpg");
    // no focal → smart g_auto; width included when given
    expect(cldCrop(RAW, { ar: "1:1", width: 800 }))
      .toBe("https://res.cloudinary.com/samorah/image/upload/c_fill,g_auto,ar_1:1,w_800,f_auto,q_auto/v1710000000/products/kashmiri-chai.jpg");
    // invalid ar is dropped; non-Cloudinary + already-transformed pass through
    expect(cldCrop(RAW, { ar: "bogus" })).toBe("https://res.cloudinary.com/samorah/image/upload/c_fill,g_auto,f_auto,q_auto/v1710000000/products/kashmiri-chai.jpg");
    expect(cldCrop("https://example.com/x.jpg", { ar: "1:1" })).toBe("https://example.com/x.jpg");
    const already = "https://res.cloudinary.com/samorah/image/upload/c_fill,ar_1:1/v1/products/x.jpg";
    expect(cldCrop(already, { ar: "16:9" })).toBe(already);
  });
});
