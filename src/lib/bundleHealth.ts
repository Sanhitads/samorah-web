/**
 * Bundle publish health (derived, NEVER persisted). Recomputed from the current config + canonical
 * catalog/inventory data. Distinguishes CONFIG-caused impossibility (ERROR — blocks publish) from
 * runtime INVENTORY shortage (WARNING — publish allowed, disclosed), per the approved commercial-
 * viability rule. Inventory remains the external runtime authority (option.inStock ← canonical isInStock).
 */
import { BUNDLE_SIZE, optionFor, type BundleCandle } from "@/lib/bundle";
import { resolveVessels, applyBundleMerchandising, validateBundleConfig, type BundleConfig } from "@/lib/bundleConfig";

export interface BundleVesselHealth {
  key: string;
  name: string;
  comingSoon: boolean;
  eligible: number; // config-selectable (eligible catalog set minus exclusions), offering this vessel
  sellable: number; // of those, currently in stock (canonical isInStock)
}
export interface BundleHealth {
  errors: string[];
  warnings: string[];
  eligibleTotal: number;
  vessels: BundleVesselHealth[];
}

/** Derived health for a config against the canonical eligible candles. Errors block publish. */
export function computeBundleHealth(config: BundleConfig, candles: BundleCandle[]): BundleHealth {
  const errors: string[] = [];
  const warnings: string[] = [];
  const eligible = applyBundleMerchandising(candles, config); // exclusions applied; can never inject

  const vessels: BundleVesselHealth[] = resolveVessels(config).map((v) => {
    const forVessel = eligible.filter((c) => optionFor(c, v.key));
    const sellable = forVessel.filter((c) => optionFor(c, v.key)!.inStock);
    if (!v.comingSoon) {
      if (forVessel.length < BUNDLE_SIZE) {
        // CONFIG-caused: exclusions/config leave fewer than a valid composition needs → ERROR.
        errors.push(`Vessel "${v.name}": configuration leaves ${forVessel.length} selectable candle(s) — a composition needs ${BUNDLE_SIZE}.`);
      } else if (sellable.length < BUNDLE_SIZE) {
        // INVENTORY-caused: enough configured, but not enough in stock right now → WARNING (runtime).
        warnings.push(`Vessel "${v.name}": only ${sellable.length} of ${forVessel.length} candles are currently in stock (needs ${BUNDLE_SIZE}).`);
      }
    }
    return { key: v.key, name: v.name, comingSoon: v.comingSoon, eligible: forVessel.length, sellable: sellable.length };
  });

  // Stale merchandising references → WARNING (renderer falls back; never fatal).
  const eligibleIds = new Set(eligible.map((c) => c.id));
  const stale = [
    ...(config.productOrder ?? []),
    ...(config.excludedProductIds ?? []),
    ...Object.keys(config.productOverrides ?? {}),
  ].filter((id) => id && !eligibleIds.has(id) && !candles.some((c) => c.id === id));
  if (stale.length) warnings.push(`${stale.length} merchandising reference(s) point to products no longer eligible — they are ignored.`);

  return { errors, warnings, eligibleTotal: eligible.length, vessels };
}

/** Combined publish gate: pure structural validation + derived commercial-viability health. */
export function validateBundleForPublish(config: BundleConfig, candles: BundleCandle[]): { errors: string[]; warnings: string[] } {
  const v = validateBundleConfig(config);
  const h = computeBundleHealth(config, candles);
  return { errors: [...v.errors, ...h.errors], warnings: [...v.warnings, ...h.warnings] };
}
