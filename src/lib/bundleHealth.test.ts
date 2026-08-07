import { describe, it, expect } from "vitest";
import { computeBundleHealth, validateBundleForPublish } from "@/lib/bundleHealth";
import { DEFAULT_BUNDLE_CONFIG, type BundleConfig } from "@/lib/bundleConfig";
import type { BundleCandle } from "@/lib/bundle";

const glass = (id: string, inStock: boolean): BundleCandle => ({
  id, slug: id, name: id, tagline: null, chapter: null, edition: "", image: { url: "gradient:x", alt: id },
  vessels: [{ vessel: "glass", variantId: `${id}-g`, size: "100g", price: 500, inStock }],
});
// glass-only config: ceramic/terracotta have no candles; terracotta is coming-soon (skipped),
// but ceramic (enabled, 0 candles) would ERROR — so mark ceramic coming-soon for these focused tests.
const glassOnly = (over: Partial<BundleConfig> = {}): BundleConfig => ({
  ...DEFAULT_BUNDLE_CONFIG,
  vessels: [
    { key: "glass", displayOrder: 0, nameOverride: null, blurbOverride: null, imageId: null, comingSoon: false },
    { key: "ceramic", displayOrder: 1, nameOverride: null, blurbOverride: null, imageId: null, comingSoon: true },
    { key: "terracotta", displayOrder: 2, nameOverride: null, blurbOverride: null, imageId: null, comingSoon: true },
  ],
  ...over,
});

describe("bundle health — commercial viability ERROR vs WARNING", () => {
  it("enough eligible + in stock → no error/warning", () => {
    const h = computeBundleHealth(glassOnly(), [glass("a", true), glass("b", true), glass("c", true)]);
    expect(h.errors).toEqual([]);
    expect(h.warnings).toEqual([]);
    expect(h.vessels.find((v) => v.key === "glass")).toMatchObject({ eligible: 3, sellable: 3 });
  });

  it("CONFIG leaves < 3 selectable for an enabled vessel → ERROR (blocks publish)", () => {
    // 4 eligible but 2 excluded → 2 selectable < 3
    const cfg = glassOnly({ excludedProductIds: ["c", "d"] });
    const h = computeBundleHealth(cfg, [glass("a", true), glass("b", true), glass("c", true), glass("d", true)]);
    expect(h.errors.some((e) => /leaves 2 selectable/.test(e))).toBe(true);
    expect(h.warnings).toEqual([]);
  });

  it("enough configured but INVENTORY OOS makes < 3 in stock → WARNING (not config-invalid)", () => {
    const h = computeBundleHealth(glassOnly(), [glass("a", true), glass("b", true), glass("c", false), glass("d", false)]);
    expect(h.errors).toEqual([]); // config is fine
    expect(h.warnings.some((w) => /currently in stock/.test(w))).toBe(true);
    expect(h.vessels.find((v) => v.key === "glass")).toMatchObject({ eligible: 4, sellable: 2 });
  });

  it("coming-soon vessel with 0 candles does NOT error", () => {
    const h = computeBundleHealth(glassOnly(), [glass("a", true), glass("b", true), glass("c", true)]);
    // ceramic + terracotta are coming-soon → skipped
    expect(h.errors).toEqual([]);
  });

  it("validateBundleForPublish merges structural + commercial (hero heading required)", () => {
    const bad = glassOnly({ hero: { ...DEFAULT_BUNDLE_CONFIG.hero, heading: "  " } });
    const v = validateBundleForPublish(bad, [glass("a", true), glass("b", true), glass("c", true)]);
    expect(v.errors).toContain("Hero heading is required");
  });
});
