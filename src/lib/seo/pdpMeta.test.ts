import { describe, it, expect } from "vitest";
import { pdpMetaBase } from "@/lib/seo/pdpMeta";

/**
 * PDP social metadata (item 2). pdpMetaBase is the SINGLE path both the active and the archived PDP use
 * (the route has no archived branch), so these fixtures prove an archived/indexable PDP generates the
 * complete OG + Twitter set with the SAME product hierarchy as an active PDP. The site-default OG image
 * fallback is layered afterwards by withRouteSeo (covered in routeSeoPrecedence.test.ts) — no fake asset.
 */
const view = {
  name: "Whispered Flame",
  tagline: "For nights you want to stretch a little longer.",
  gallery: [{ src: "https://res.cloudinary.com/x/whispered-flame.jpg" }],
};

const og = (m: ReturnType<typeof pdpMetaBase>) => m.openGraph as Record<string, unknown>;
const tw = (m: ReturnType<typeof pdpMetaBase>) => m.twitter as Record<string, unknown>;
const canon = (m: ReturnType<typeof pdpMetaBase>) => (m.alternates as { canonical?: string }).canonical;

describe("pdpMetaBase — archived/indexable PDP generates complete OG + Twitter (same hierarchy as active)", () => {
  it("with product CMS SEO: full OG title/description/url + Twitter card/title/description, and a self canonical", () => {
    const seo = { title: "Whispered Flame Candle | Warm Floral & Amber | Samorah", description: "Jasmine, rose, amber and leather." };
    const m = pdpMetaBase("whispered-flame", view, seo);
    expect(canon(m)).toBe("/shop/whispered-flame");
    expect(og(m).title).toBe(seo.title);
    expect(og(m).description).toBe(seo.description);
    expect(og(m).url).toBe("/shop/whispered-flame");
    expect(og(m).type).toBe("website");
    expect(og(m).images).toEqual(["https://res.cloudinary.com/x/whispered-flame.jpg"]); // own gallery image
    expect(tw(m).card).toBe("summary_large_image");
    expect(tw(m).title).toBe(seo.title);
    expect(tw(m).description).toBe(seo.description);
    expect(tw(m).images).toEqual(["https://res.cloudinary.com/x/whispered-flame.jpg"]);
  });

  it("a page-specific seo_og_image wins over the gallery fallback (on both OG and Twitter)", () => {
    const m = pdpMetaBase("x", view, { ogImage: "https://res.cloudinary.com/x/custom-og.jpg" });
    expect(og(m).images).toEqual(["https://res.cloudinary.com/x/custom-og.jpg"]);
    expect(tw(m).images).toEqual(["https://res.cloudinary.com/x/custom-og.jpg"]);
  });

  it("falls back to the product name + tagline when no CMS SEO is set (title bare → template brands once)", () => {
    const m = pdpMetaBase("x", view, {});
    expect(m.title).toBe("Whispered Flame");
    expect(og(m).title).toBe("Whispered Flame · Samorah"); // social title always branded
    expect(m.description).toBe(view.tagline);
    expect(og(m).description).toBe(view.tagline);
  });

  it("a gradient-only gallery emits NO og:image/twitter:image (site default is layered later; never a broken URL)", () => {
    const m = pdpMetaBase("x", { ...view, gallery: [{ src: "gradient:grad-chai" }] }, {});
    expect(og(m).images).toBeUndefined();
    expect(tw(m).images).toBeUndefined();
  });

  it("archived and active views produce identical metadata for the same inputs (no archived branch)", () => {
    const seo = { title: "Whispered Flame Candle | Samorah", description: "Warm, floral, smoky." };
    // same slug/view/seo → identical output whether the product is active or archived
    expect(pdpMetaBase("whispered-flame", view, seo)).toEqual(pdpMetaBase("whispered-flame", view, seo));
  });
});
