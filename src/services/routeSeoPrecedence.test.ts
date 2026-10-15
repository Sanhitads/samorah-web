import { describe, it, expect } from "vitest";
import type { Metadata } from "next";
import { applyRouteSeo, type RouteSeoOverride } from "@/services/seoRedirectService";

/**
 * Metadata precedence (SEO Phase 1). `applyRouteSeo` is the PURE core of `withRouteSeo`:
 * it must honour, highest first — (1) a per-route override row, (2) the page's own
 * generated/CMS metadata, (3) the site-wide default — and the site default must NEVER
 * overwrite a real page-specific value.
 */
const SITE_DEFAULT = { description: "Site-wide default description.", ogImage: "https://res.cloudinary.com/x/site-default.jpg" };
const none: RouteSeoOverride = {};

describe("applyRouteSeo — description precedence", () => {
  it("a product/page-specific description WINS over the global site default", () => {
    const base: Metadata = { description: "Kashmiri Chai — warm cardamom chai in wax." };
    const out = applyRouteSeo(base, none, SITE_DEFAULT);
    expect(out.description).toBe("Kashmiri Chai — warm cardamom chai in wax.");
  });

  it("an explicit route override WINS over the product/page-specific description", () => {
    const base: Metadata = { description: "Kashmiri Chai — warm cardamom chai in wax." };
    const override: RouteSeoOverride = { description: "Admin-curated override description." };
    const out = applyRouteSeo(base, override, SITE_DEFAULT);
    expect(out.description).toBe("Admin-curated override description.");
  });

  it("the site default is used ONLY when neither override nor page supplies a description", () => {
    const out = applyRouteSeo({}, none, SITE_DEFAULT);
    expect(out.description).toBe("Site-wide default description.");
  });

  it("with no override, no page value, and no site default, description stays undefined (framework fallback applies)", () => {
    const out = applyRouteSeo({}, none, {});
    expect(out.description).toBeUndefined();
  });
});

describe("applyRouteSeo — title policy (brand appears exactly once)", () => {
  it("a page title that already carries the brand is marked absolute so the '%s | Samorah' template won't append again", () => {
    expect(applyRouteSeo({ title: "FAQ | Samorah" }, none, SITE_DEFAULT).title).toEqual({ absolute: "FAQ | Samorah" });
    expect(applyRouteSeo({ title: "Product Care | Candles, Room & Linen Sprays | Samorah" }, none, SITE_DEFAULT).title).toEqual({
      absolute: "Product Care | Candles, Room & Linen Sprays | Samorah",
    });
    // the older middot form still counts as branded
    expect(applyRouteSeo({ title: "Kashmiri Chai · Samorah" }, none, SITE_DEFAULT).title).toEqual({ absolute: "Kashmiri Chai · Samorah" });
  });

  it("a bare / unbranded fallback title stays a plain string so the template brands it exactly once", () => {
    expect(applyRouteSeo({ title: "Example Page" }, none, SITE_DEFAULT).title).toBe("Example Page");
    expect(applyRouteSeo({ title: "Shop" }, none, SITE_DEFAULT).title).toBe("Shop");
  });

  it("an explicit route SEO override is always the complete title (absolute), even when unbranded", () => {
    expect(applyRouteSeo({ title: "Example Page" }, { title: "Admin Override" }, SITE_DEFAULT).title).toEqual({ absolute: "Admin Override" });
  });

  it("a title already provided as { absolute } is passed through untouched", () => {
    expect(applyRouteSeo({ title: { absolute: "Already Absolute" } }, none, SITE_DEFAULT).title).toEqual({ absolute: "Already Absolute" });
  });
});

describe("applyRouteSeo — canonical precedence", () => {
  it("keeps the page's self-referencing canonical when there is no override", () => {
    const out = applyRouteSeo({ alternates: { canonical: "/shop/kashmiri-chai" } }, none, SITE_DEFAULT);
    expect((out.alternates as { canonical?: string }).canonical).toBe("/shop/kashmiri-chai");
  });

  it("an override canonical wins over the page canonical", () => {
    const out = applyRouteSeo({ alternates: { canonical: "/shop/kashmiri-chai" } }, { canonical: "/shop/kashmiri-chai-override" }, SITE_DEFAULT);
    expect((out.alternates as { canonical?: string }).canonical).toBe("/shop/kashmiri-chai-override");
  });

  it("emits no canonical when neither page nor override supplies one (never fabricated from the site default)", () => {
    const out = applyRouteSeo({}, none, SITE_DEFAULT);
    expect(out.alternates).toBeUndefined();
  });
});

describe("applyRouteSeo — OG image precedence", () => {
  it("override OG image wins; else the page image; else the site default; else none", () => {
    const pageImg = [{ url: "https://res.cloudinary.com/x/product.jpg" }];
    // override wins
    expect(applyRouteSeo({ openGraph: { images: pageImg } }, { ogImage: "https://res.cloudinary.com/x/override.jpg" }, SITE_DEFAULT).openGraph).toMatchObject({ images: ["https://res.cloudinary.com/x/override.jpg"] });
    // page image wins over site default
    expect(applyRouteSeo({ openGraph: { images: pageImg } }, none, SITE_DEFAULT).openGraph).toMatchObject({ images: pageImg });
    // site default fills the gap
    expect(applyRouteSeo({ openGraph: { type: "website" } }, none, SITE_DEFAULT).openGraph).toMatchObject({ images: [SITE_DEFAULT.ogImage] });
    // nothing available → no images key, and no broken URL
    const bare = applyRouteSeo({ openGraph: { type: "website" } }, none, {});
    expect((bare.openGraph as { images?: unknown }).images).toBeUndefined();
  });

  it("propagates the resolved OG image to the Twitter card when a twitter object is present", () => {
    const out = applyRouteSeo({ openGraph: { type: "website" }, twitter: { card: "summary_large_image" } }, none, SITE_DEFAULT);
    expect((out.twitter as { images?: string[] }).images).toEqual([SITE_DEFAULT.ogImage]);
  });
});

describe("applyRouteSeo — social fallback via the default OG image (item 7)", () => {
  const WITH_DEFAULT = { ogImage: "https://res.cloudinary.com/x/default-og.jpg" };

  it("a page with OG + Twitter but no image inherits the configured default OG image on BOTH", () => {
    const base: Metadata = {
      openGraph: { title: "FAQ", description: "Answers.", type: "website", url: "/faq" },
      twitter: { card: "summary_large_image", title: "FAQ", description: "Answers." },
    };
    const out = applyRouteSeo(base, none, WITH_DEFAULT);
    expect((out.openGraph as { images?: unknown }).images).toEqual([WITH_DEFAULT.ogImage]);
    expect((out.twitter as { images?: unknown }).images).toEqual([WITH_DEFAULT.ogImage]);
    // page-specific og:title / description / url are preserved, never overridden by the fallback
    expect((out.openGraph as { title?: string; url?: string }).title).toBe("FAQ");
    expect((out.openGraph as { title?: string; url?: string }).url).toBe("/faq");
  });

  it("a stronger page-specific OG image is NOT overridden by the default", () => {
    const base: Metadata = { openGraph: { images: [{ url: "https://res.cloudinary.com/x/faq-specific.jpg" }] } };
    const out = applyRouteSeo(base, none, WITH_DEFAULT);
    expect((out.openGraph as { images?: unknown }).images).toEqual([{ url: "https://res.cloudinary.com/x/faq-specific.jpg" }]);
  });

  it("with NO default configured and no page image, no og:image / twitter:image is emitted (never a broken URL)", () => {
    const base: Metadata = { openGraph: { title: "FAQ", type: "website" }, twitter: { card: "summary" } };
    const out = applyRouteSeo(base, none, {});
    expect((out.openGraph as { images?: unknown }).images).toBeUndefined();
    expect((out.twitter as { images?: unknown }).images).toBeUndefined();
  });
});

describe("applyRouteSeo — no host leakage", () => {
  it("never introduces localhost / vercel.app into canonical or OG (only passes through what it is given)", () => {
    const out = applyRouteSeo(
      { alternates: { canonical: "/shop/kashmiri-chai" }, openGraph: { images: [{ url: "https://res.cloudinary.com/x/p.jpg" }] } },
      none,
      SITE_DEFAULT,
    );
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("localhost");
    expect(serialized).not.toContain("vercel.app");
  });
});
