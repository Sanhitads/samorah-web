/**
 * BundleConfig V1 — the editorial presentation config for /bundles (Bundle CMS, Phase 0).
 *
 * OWNS presentation only: hero/section/flow copy, vessel merchandising, and OPTIONAL per-product
 * card-description/image overrides + display order + exclusion. It NEVER owns product identity, price,
 * the discount rate, collection/chapter identity, or stock — those stay with their canonical domains.
 * The discount percentage in copy is a token (`{{discount_pct}}`) resolved from the canonical
 * BUNDLE_DISCOUNT_PCT, so shown ≠ charged is impossible. schema_version enables safe future migration
 * (V1 normalization only in this phase). A malformed config normalizes to DEFAULT_BUNDLE_CONFIG — the
 * storefront never crashes on a bad optional payload.
 */
import { BUNDLE_DISCOUNT_PCT, BUNDLE_VESSELS, type BundleCandle } from "@/lib/bundle";

export const BUNDLE_CONFIG_VERSION = 1;
export const DISCOUNT_TOKEN = "{{discount_pct}}";

export interface BundleHeroConfig {
  eyebrow: string;
  heading: string; // may contain "\n" for the two-line title
  body: string; // may contain {{discount_pct}}
  imageId?: string | null; // media.id (optional; falls back to the bundle gradient)
  imageMobileId?: string | null;
  alt?: string | null;
  focal?: string | null;
  focalMobile?: string | null;
}
export interface BundleVesselConfig {
  key: string; // canonical vessel_type ("glass"|"ceramic"|"terracotta")
  displayOrder: number;
  nameOverride?: string | null; // null → canonical BUNDLE_VESSELS name
  blurbOverride?: string | null; // null → canonical blurb
  imageId?: string | null; // optional merchandising image (media.id)
  comingSoon?: boolean | null; // null → canonical comingSoon
}
export interface BundleProductOverride {
  cardDescription?: string | null; // null/empty → products.tagline
  imageId?: string | null; // media.id → resolved by the service; else canonical primary image
}
export interface BundleConfig {
  schemaVersion: number;
  hero: BundleHeroConfig;
  strip: string[];
  vesselSection: { eyebrow: string; heading: string };
  vessels: BundleVesselConfig[];
  candleSection: { heading: string; sizeLine: string };
  flowCopy: { emptyHint: string; completeLine: string; footerLine: string; editingNote: string };
  chapterOverrides?: Record<string, { label?: string | null; order?: number | null }>;
  productOrder?: string[];
  excludedProductIds?: string[];
  productOverrides?: Record<string, BundleProductOverride>;
}

// ── DEFAULT (0D) — reproduces the CURRENT hard-coded /bundles page EXACTLY ──────
// Copy traced verbatim from src/app/(store)/bundles/page.tsx + BundleBuilder.tsx; the "15%" strings are
// tokenized so resolution yields the identical text while the rate stays canonical.
export const DEFAULT_BUNDLE_CONFIG: BundleConfig = {
  schemaVersion: BUNDLE_CONFIG_VERSION,
  hero: {
    eyebrow: "Discovery Collection",
    heading: "Compose Your\nThree",
    body: `A single vessel, three signature scents, one considered set — ${DISCOUNT_TOKEN}% when the composition is complete.`,
    imageId: null,
    imageMobileId: null,
    alt: null,
    focal: null,
    focalMobile: null,
  },
  strip: ["Discovery Collection", "100g Signature Candles", "Compose Any Three"],
  vesselSection: { eyebrow: "Step One", heading: "Choose Your Vessel" },
  // Identity (key/material/name/blurb/comingSoon) stays canonical in BUNDLE_VESSELS; the default config
  // carries only order (overrides null → canonical), so the page is pixel-identical yet editable in Phase 1.
  vessels: BUNDLE_VESSELS.map((v, i) => ({
    key: v.key,
    displayOrder: i,
    nameOverride: null,
    blurbOverride: null,
    imageId: null,
    comingSoon: null,
  })),
  candleSection: { heading: "Choose Any Three", sizeLine: "100g Signature Candles" },
  flowCopy: {
    emptyHint: "Choose your first candle to begin.",
    completeLine: "Composition Complete",
    footerLine: `Any three 100g candles · ${DISCOUNT_TOKEN}% composition discount.`,
    editingNote: "Editing this composition will update the version currently in your bag.",
  },
  productOrder: [],
  excludedProductIds: [],
  productOverrides: {},
};

// ── Token resolution ───────────────────────────────────────────────────────────
/** Replace presentation tokens with canonical values. Only {{discount_pct}} today. */
export function resolveTokens(text: string | null | undefined): string {
  if (!text) return "";
  return text.split(DISCOUNT_TOKEN).join(String(BUNDLE_DISCOUNT_PCT));
}

// ── Normalization (safe fallback; V1 only, no speculative future migrations) ─────
const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const strArr = (v: unknown, fallback: string[]): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : fallback;
const idArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Coerce an unknown/old/partial payload into a valid V1 BundleConfig; a hopeless payload → DEFAULT.
 *  This is the storefront's crash-proofing: a malformed published config renders the default page. */
export function normalizeBundleConfig(raw: unknown): BundleConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_BUNDLE_CONFIG;
  const r = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = DEFAULT_BUNDLE_CONFIG;
  const hero = (r.hero ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const canonicalKeys = new Set(BUNDLE_VESSELS.map((v) => v.key));

  const vessels: BundleVesselConfig[] = Array.isArray(r.vessels)
    ? (r.vessels as any[]) // eslint-disable-line @typescript-eslint/no-explicit-any
        .filter((v) => v && typeof v.key === "string" && canonicalKeys.has(v.key)) // drop unknown vessel keys
        .map((v, i) => ({
          key: v.key as string,
          displayOrder: typeof v.displayOrder === "number" ? v.displayOrder : i,
          nameOverride: typeof v.nameOverride === "string" ? v.nameOverride : null,
          blurbOverride: typeof v.blurbOverride === "string" ? v.blurbOverride : null,
          imageId: typeof v.imageId === "string" ? v.imageId : null,
          comingSoon: typeof v.comingSoon === "boolean" ? v.comingSoon : null,
        }))
    : d.vessels;

  const overrides: Record<string, BundleProductOverride> = {};
  if (r.productOverrides && typeof r.productOverrides === "object") {
    for (const [pid, ov] of Object.entries(r.productOverrides as Record<string, any>)) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!ov || typeof ov !== "object") continue;
      overrides[pid] = {
        cardDescription: typeof ov.cardDescription === "string" ? ov.cardDescription : null,
        imageId: typeof ov.imageId === "string" ? ov.imageId : null,
      };
    }
  }

  return {
    schemaVersion: BUNDLE_CONFIG_VERSION, // pin V1
    hero: {
      eyebrow: str(hero.eyebrow, d.hero.eyebrow),
      heading: str(hero.heading, d.hero.heading),
      body: str(hero.body, d.hero.body),
      imageId: typeof hero.imageId === "string" ? hero.imageId : null,
      imageMobileId: typeof hero.imageMobileId === "string" ? hero.imageMobileId : null,
      alt: typeof hero.alt === "string" ? hero.alt : null,
      focal: typeof hero.focal === "string" ? hero.focal : null,
      focalMobile: typeof hero.focalMobile === "string" ? hero.focalMobile : null,
    },
    strip: strArr(r.strip, d.strip),
    vesselSection: {
      eyebrow: str(r.vesselSection?.eyebrow, d.vesselSection.eyebrow),
      heading: str(r.vesselSection?.heading, d.vesselSection.heading),
    },
    vessels: vessels.length ? vessels : d.vessels,
    candleSection: {
      heading: str(r.candleSection?.heading, d.candleSection.heading),
      sizeLine: str(r.candleSection?.sizeLine, d.candleSection.sizeLine),
    },
    flowCopy: {
      emptyHint: str(r.flowCopy?.emptyHint, d.flowCopy.emptyHint),
      completeLine: str(r.flowCopy?.completeLine, d.flowCopy.completeLine),
      footerLine: str(r.flowCopy?.footerLine, d.flowCopy.footerLine),
      editingNote: str(r.flowCopy?.editingNote, d.flowCopy.editingNote),
    },
    chapterOverrides: r.chapterOverrides && typeof r.chapterOverrides === "object" ? r.chapterOverrides : undefined,
    productOrder: idArr(r.productOrder),
    excludedProductIds: idArr(r.excludedProductIds),
    productOverrides: overrides,
  };
}

// ── Structural validation (pure). DB-aware stale-reference checks are the server's publish summary. ──
export interface BundleValidation {
  errors: string[];
  warnings: string[];
}
/** Pure structural validation. ERROR blocks publish; WARNING is advisory. Hero MEDIA is NOT required
 *  (missing image → gradient fallback = WARNING), but hero HEADING is (Amendment 5). */
export function validateBundleConfig(cfg: BundleConfig): BundleValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (cfg.schemaVersion !== BUNDLE_CONFIG_VERSION) errors.push(`Unsupported schema_version ${cfg.schemaVersion}`);
  if (!cfg.hero.heading.trim()) errors.push("Hero heading is required");
  if (!cfg.hero.eyebrow.trim()) warnings.push("Hero eyebrow is empty");
  if (!cfg.hero.imageId) warnings.push("No hero image set — the bundle gradient will be used");
  if (!cfg.candleSection.heading.trim()) errors.push("Candle section heading is required");

  const canonicalKeys = new Set(BUNDLE_VESSELS.map((v) => v.key));
  for (const v of cfg.vessels) if (!canonicalKeys.has(v.key)) errors.push(`Unknown vessel key: ${v.key}`);

  const order = cfg.productOrder ?? [];
  if (new Set(order).size !== order.length) errors.push("Duplicate product IDs in display order");

  return { errors, warnings };
}

// ── Pure resolvers (renderer + preview share these; fallback-safe) ───────────────

export interface ResolvedVessel {
  key: string;
  material: string; // canonical (identity)
  name: string; // override → canonical
  blurb: string; // override → canonical
  comingSoon: boolean; // override → canonical
  imageId: string | null;
}

/** Merge config vessels over the canonical BUNDLE_VESSELS, in display order. Unknown keys are dropped;
 *  a config that omits a canonical vessel simply doesn't show it (default config lists all three). */
export function resolveVessels(cfg: BundleConfig): ResolvedVessel[] {
  const canon = new Map(BUNDLE_VESSELS.map((v) => [v.key, v]));
  return [...cfg.vessels]
    .filter((v) => canon.has(v.key))
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((v) => {
      const c = canon.get(v.key)!;
      return {
        key: v.key,
        material: c.material,
        name: (v.nameOverride && v.nameOverride.trim()) || c.name,
        blurb: (v.blurbOverride && v.blurbOverride.trim()) || c.blurb,
        comingSoon: typeof v.comingSoon === "boolean" ? v.comingSoon : c.comingSoon,
        imageId: v.imageId ?? null,
      };
    });
}

/** A candle plus its resolved bundle-merchandising presentation (never overrides identity/price/stock). */
export interface ResolvedBundleCandle extends BundleCandle {
  /** override → products.tagline (may be null if neither exists). */
  displayDescription: string | null;
  /** optional media.id to override the card image; the service resolves it (else canonical primary). */
  overrideImageId: string | null;
}

/** Apply exclusion + display order + description/image overrides to the DERIVED eligible catalog set.
 *  CRITICAL: this only annotates/reorders/filters the eligible candles passed in — it can NEVER inject a
 *  product that isn't already eligible. Stale override/order/exclusion ids referencing non-eligible
 *  products are silently ignored (they don't match any candle in the set). */
export function applyBundleMerchandising(candles: BundleCandle[], cfg: BundleConfig): ResolvedBundleCandle[] {
  const excluded = new Set(cfg.excludedProductIds ?? []);
  const overrides = cfg.productOverrides ?? {};
  const kept = candles.filter((c) => !excluded.has(c.id));

  // Order: config order first (only ids that exist in the eligible set), then remaining catalog order.
  const orderIdx = new Map((cfg.productOrder ?? []).map((id, i) => [id, i]));
  const ordered = [...kept].sort((a, b) => {
    const ai = orderIdx.has(a.id) ? orderIdx.get(a.id)! : Number.POSITIVE_INFINITY;
    const bi = orderIdx.has(b.id) ? orderIdx.get(b.id)! : Number.POSITIVE_INFINITY;
    return ai - bi; // stable for equal (both catalog-ordered)
  });

  return ordered.map((c) => {
    const ov = overrides[c.id];
    const desc = ov?.cardDescription && ov.cardDescription.trim() ? ov.cardDescription : c.tagline;
    return { ...c, displayDescription: desc ?? null, overrideImageId: ov?.imageId ?? null };
  });
}

/**
 * Availability-transition safety (V5). A composition item is valid only while its candle is still
 * eligible AND its per-vessel option is in stock on the CURRENT canonical data. A previously-selected
 * candle that has since gone OOS/ineligible is NOT a valid selectable composition item — callers must
 * block add-to-bag. Uses the same canonical isInStock authority (via option.inStock); introduces no
 * second inventory authority. Returns true only when EVERY selected item is still available.
 */
export function selectionAllAvailable(
  items: { id: string; vessel: string }[],
  candles: BundleCandle[],
): boolean {
  const byId = new Map(candles.map((c) => [c.id, c]));
  return items.every((it) => {
    const candle = byId.get(it.id);
    if (!candle) return false; // no longer eligible
    const opt = candle.vessels.find((v) => v.vessel === it.vessel);
    return !!opt && opt.inStock; // still offered for that vessel AND in stock
  });
}
