/**
 * Asset resolver (§11) — turns an `AssetRef` into a concrete `Asset`.
 *
 * Responsibility: the one place that resolves media references, in order:
 *   Registry → Alias → Gradient → URL.
 * The alias layer lets marketing rename an asset ("hero-winter" → "hero-2028")
 * without changing content. Raw URLs are a DEV-ONLY escape hatch (a warning is
 * logged). Framework-agnostic (no React/Next); the `AssetImage` atom consumes
 * it. Principles: Assets before URLs; API before Interface.
 */
import type { Asset, AssetRef, ImageRole } from "./asset";

const GRADIENT_PREFIX = "gradient:";

export function isGradientRef(ref: string): boolean {
  return ref.startsWith(GRADIENT_PREFIX);
}

/** "gradient:grad-chai" → "grad-chai" (the dev placeholder CSS class). */
export function gradientClassOf(ref: string): string | null {
  return isGradientRef(ref) ? ref.slice(GRADIENT_PREFIX.length) : null;
}

/** The Media Library index (id → Asset) and an alias index (alias → id). Empty
 *  until real assets land; the resolver falls back to gradient / URL refs. */
const ASSET_INDEX = new Map<string, Asset>();
const ALIAS_INDEX = new Map<string, string>();

export function registerAssets(assets: Asset[]): void {
  for (const a of assets) ASSET_INDEX.set(a.id, a);
}

export function registerAssetAliases(aliases: Record<string, string>): void {
  for (const [alias, id] of Object.entries(aliases)) ALIAS_INDEX.set(alias, id);
}

const URL_RE = /^(https?:|\/)/;
const isDev =
  typeof process !== "undefined" && process.env?.NODE_ENV !== "production";

function placeholderAsset(
  ref: string,
  opts?: { role?: ImageRole; alt?: string },
): Asset {
  return {
    id: ref,
    kind: "image",
    desktop: ref, // a "gradient:" marker or a URL
    role: opts?.role ?? "support",
    alt: opts?.alt ?? "",
    decorative: !opts?.alt,
  };
}

/** Resolve an `AssetRef` into an `Asset` (or `null` if it can't be resolved). */
export function resolveAsset(
  ref: AssetRef | null | undefined,
  opts?: { role?: ImageRole; alt?: string },
): Asset | null {
  if (!ref) return null;

  // Registry → Alias → Gradient → URL
  const direct = ASSET_INDEX.get(ref);
  if (direct) return direct;

  const aliased = ALIAS_INDEX.get(ref);
  if (aliased) {
    const target = ASSET_INDEX.get(aliased);
    if (target) return target;
  }

  if (isGradientRef(ref)) return placeholderAsset(ref, opts);

  if (URL_RE.test(ref)) {
    if (isDev) {
      console.warn(
        `[assets] Raw URL resolved ("${ref}"). This is a dev-only escape hatch — ` +
          `register an Asset in the Media Library so Assets stay canonical.`,
      );
    }
    return placeholderAsset(ref, opts);
  }

  return null;
}
