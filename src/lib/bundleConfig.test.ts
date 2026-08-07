import { describe, it, expect } from "vitest";
import {
  DEFAULT_BUNDLE_CONFIG,
  BUNDLE_CONFIG_VERSION,
  resolveTokens,
  normalizeBundleConfig,
  validateBundleConfig,
  resolveVessels,
  applyBundleMerchandising,
  selectionAllAvailable,
  type BundleConfig,
} from "@/lib/bundleConfig";
import { BUNDLE_DISCOUNT_PCT, BUNDLE_VESSELS, type BundleCandle } from "@/lib/bundle";
import { COMPOSITION_DISCOUNT_PCT } from "@/store/useCartStore";

const candle = (id: string, tagline: string | null): BundleCandle => ({
  id, slug: id, name: `Candle ${id}`, tagline, chapter: null, edition: "", image: { url: "gradient:x", alt: id }, vessels: [],
});
const candleWithVessel = (id: string, vessel: string, inStock: boolean): BundleCandle => ({
  id, slug: id, name: id, tagline: null, chapter: null, edition: "", image: { url: "gradient:x", alt: id },
  vessels: [{ vessel, variantId: `${id}-v`, size: "100g", price: 500, inStock }],
});

describe("BundleConfig V1 — default parity + tokens", () => {
  it("default is V1 and lists all canonical vessels in order", () => {
    expect(DEFAULT_BUNDLE_CONFIG.schemaVersion).toBe(BUNDLE_CONFIG_VERSION);
    expect(DEFAULT_BUNDLE_CONFIG.vessels.map((v) => v.key)).toEqual(BUNDLE_VESSELS.map((v) => v.key));
  });
  it("token resolution yields the exact current copy (discount pct canonical)", () => {
    expect(resolveTokens(DEFAULT_BUNDLE_CONFIG.hero.body)).toBe(
      `A single vessel, three signature scents, one considered set — ${BUNDLE_DISCOUNT_PCT}% when the composition is complete.`,
    );
    expect(resolveTokens(DEFAULT_BUNDLE_CONFIG.flowCopy.footerLine)).toBe(
      `Any three 100g candles · ${BUNDLE_DISCOUNT_PCT}% composition discount.`,
    );
    // pct is canonical → equals 15 today, and can never diverge from the charge
    expect(BUNDLE_DISCOUNT_PCT).toBe(15);
  });
});

describe("DEFAULT config parity — reproduces the current hard-coded /bundles page exactly", () => {
  const d = DEFAULT_BUNDLE_CONFIG;
  it("hero", () => {
    expect(d.hero.eyebrow).toBe("Discovery Collection");
    expect(d.hero.heading).toBe("Compose Your\nThree");
    expect(resolveTokens(d.hero.body)).toBe(
      "A single vessel, three signature scents, one considered set — 15% when the composition is complete.",
    );
  });
  it("strip + sections", () => {
    expect(d.strip).toEqual(["Discovery Collection", "100g Signature Candles", "Compose Any Three"]);
    expect(d.vesselSection).toEqual({ eyebrow: "Step One", heading: "Choose Your Vessel" });
    expect(d.candleSection).toEqual({ heading: "Choose Any Three", sizeLine: "100g Signature Candles" });
  });
  it("flow copy", () => {
    expect(d.flowCopy.emptyHint).toBe("Choose your first candle to begin.");
    expect(d.flowCopy.completeLine).toBe("Composition Complete");
    expect(resolveTokens(d.flowCopy.footerLine)).toBe("Any three 100g candles · 15% composition discount.");
    expect(d.flowCopy.editingNote).toBe("Editing this composition will update the version currently in your bag.");
  });
  it("vessel copy falls back to the exact canonical values", () => {
    const rv = resolveVessels(d);
    expect(rv.map((v) => v.name)).toEqual(["Glass Edition", "Ceramic Edition", "Terracotta Edition"]);
    expect(rv.map((v) => v.comingSoon)).toEqual([false, false, true]);
  });
});

describe("normalize — safe fallback (V1 only)", () => {
  it("malformed payload → DEFAULT", () => {
    expect(normalizeBundleConfig(null)).toEqual(DEFAULT_BUNDLE_CONFIG);
    expect(normalizeBundleConfig("nope")).toEqual(DEFAULT_BUNDLE_CONFIG);
    expect(normalizeBundleConfig(42)).toEqual(DEFAULT_BUNDLE_CONFIG);
  });
  it("partial payload merges over default; pins schema_version to 1", () => {
    const n = normalizeBundleConfig({ schemaVersion: 99, hero: { heading: "Custom" } });
    expect(n.schemaVersion).toBe(1);
    expect(n.hero.heading).toBe("Custom");
    expect(n.hero.eyebrow).toBe(DEFAULT_BUNDLE_CONFIG.hero.eyebrow); // filled from default
    expect(n.strip).toEqual(DEFAULT_BUNDLE_CONFIG.strip);
  });
  it("drops unknown vessel keys during normalization", () => {
    const n = normalizeBundleConfig({ vessels: [{ key: "glass", displayOrder: 0 }, { key: "plastic", displayOrder: 1 }] });
    expect(n.vessels.map((v) => v.key)).toEqual(["glass"]);
  });
});

describe("validate — ERROR vs WARNING", () => {
  it("hero heading required (ERROR); hero image optional (WARNING)", () => {
    const bad: BundleConfig = { ...DEFAULT_BUNDLE_CONFIG, hero: { ...DEFAULT_BUNDLE_CONFIG.hero, heading: "  " } };
    const v = validateBundleConfig(bad);
    expect(v.errors).toContain("Hero heading is required");
    // default has no hero image → WARNING, never an error
    const dv = validateBundleConfig(DEFAULT_BUNDLE_CONFIG);
    expect(dv.errors).toEqual([]);
    expect(dv.warnings.some((w) => /hero image/i.test(w))).toBe(true);
  });
  it("duplicate product order ids → ERROR", () => {
    const v = validateBundleConfig({ ...DEFAULT_BUNDLE_CONFIG, productOrder: ["p1", "p1"] });
    expect(v.errors).toContain("Duplicate product IDs in display order");
  });
});

describe("resolveVessels — override → canonical merge", () => {
  it("falls back to canonical name/blurb/comingSoon when overrides are null", () => {
    const rv = resolveVessels(DEFAULT_BUNDLE_CONFIG);
    const glass = rv.find((v) => v.key === "glass")!;
    const canon = BUNDLE_VESSELS.find((v) => v.key === "glass")!;
    expect(glass.name).toBe(canon.name);
    expect(glass.blurb).toBe(canon.blurb);
    const terra = rv.find((v) => v.key === "terracotta")!;
    expect(terra.comingSoon).toBe(true); // canonical Coming Soon preserved
  });
  it("applies overrides when present", () => {
    const cfg: BundleConfig = {
      ...DEFAULT_BUNDLE_CONFIG,
      vessels: [{ key: "glass", displayOrder: 0, nameOverride: "Crystal", blurbOverride: null, imageId: null, comingSoon: true }],
    };
    const glass = resolveVessels(cfg)[0];
    expect(glass.name).toBe("Crystal");
    expect(glass.comingSoon).toBe(true); // presentation restrict works
  });
});

describe("applyBundleMerchandising — override→tagline, exclusion, order, stale-ignore", () => {
  const candles = [candle("a", "Tagline A"), candle("b", "Tagline B"), candle("c", null)];

  it("description falls back to product tagline when no override", () => {
    const r = applyBundleMerchandising(candles, DEFAULT_BUNDLE_CONFIG);
    expect(r.map((c) => c.displayDescription)).toEqual(["Tagline A", "Tagline B", null]);
  });
  it("override wins over tagline", () => {
    const cfg = { ...DEFAULT_BUNDLE_CONFIG, productOverrides: { a: { cardDescription: "Bundle-only line" } } };
    const r = applyBundleMerchandising(candles, cfg);
    expect(r.find((c) => c.id === "a")!.displayDescription).toBe("Bundle-only line");
  });
  it("excluded product is removed", () => {
    const cfg = { ...DEFAULT_BUNDLE_CONFIG, excludedProductIds: ["b"] };
    expect(applyBundleMerchandising(candles, cfg).map((c) => c.id)).toEqual(["a", "c"]);
  });
  it("config order first, remaining catalog order after", () => {
    const cfg = { ...DEFAULT_BUNDLE_CONFIG, productOrder: ["c", "a"] };
    expect(applyBundleMerchandising(candles, cfg).map((c) => c.id)).toEqual(["c", "a", "b"]);
  });
  it("STALE ids (order/exclude/override for a product NOT in the eligible set) are silently ignored — cannot inject", () => {
    const cfg = {
      ...DEFAULT_BUNDLE_CONFIG,
      productOrder: ["ghost", "a"],
      excludedProductIds: ["ghost2"],
      productOverrides: { ghost3: { cardDescription: "should never appear" } },
    };
    const r = applyBundleMerchandising(candles, cfg);
    expect(r.map((c) => c.id)).toEqual(["a", "b", "c"]); // ghost ordering ignored; no injection
    expect(r.some((c) => c.displayDescription === "should never appear")).toBe(false);
  });
});

describe("V5 — selection availability transition safety", () => {
  it("returns false when a selected candle is OOS or no longer eligible on refreshed data", () => {
    const live = [candleWithVessel("a", "glass", true), candleWithVessel("b", "glass", false)];
    // all selected still available
    expect(selectionAllAvailable([{ id: "a", vessel: "glass" }], live)).toBe(true);
    // selected candle went OOS
    expect(selectionAllAvailable([{ id: "a", vessel: "glass" }, { id: "b", vessel: "glass" }], live)).toBe(false);
    // selected candle no longer eligible (not in live set)
    expect(selectionAllAvailable([{ id: "gone", vessel: "glass" }], live)).toBe(false);
    // selected for a vessel it no longer offers
    expect(selectionAllAvailable([{ id: "a", vessel: "ceramic" }], live)).toBe(false);
  });
});

describe("V6 — displayed pct == canonical == promotion pct", () => {
  it("BUNDLE_DISCOUNT_PCT is the single source for display and cart/checkout copy", () => {
    expect(BUNDLE_DISCOUNT_PCT).toBe(15);
    expect(COMPOSITION_DISCOUNT_PCT).toBe(BUNDLE_DISCOUNT_PCT); // cart/checkout display alias
    expect(resolveTokens(DEFAULT_BUNDLE_CONFIG.flowCopy.footerLine)).toContain(`${BUNDLE_DISCOUNT_PCT}%`);
  });
});
