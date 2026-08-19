import type { StaticLightSource } from "../sources/lightSource";

/**
 * Composition Layer — StaticLightSource.
 *
 * Sibling of FlameLightSource: NOT engine code, NOT test code — the in-between COMPOSITION layer
 * (Platform Engine → **Composition Layer** → Experience). It composes the frozen public `LightSource`
 * interface (via the typed `StaticLightSource` shape) to represent a fixed, hand-placed ambient light — a
 * light with no flame behind it (e.g. a persistent editorial glow). It modifies **no** engine —
 * `AmbientLight`, `resolveAmbientLight()`, `LightingPreset`, `LightSource` are all untouched — and it is
 * deliberately **NOT** exported from `lighting/index.ts` (not public API).
 *
 * Pure · deterministic · SSR-safe: no browser APIs, no state, no timers, no animation, no driver. The
 * Experience supplies position/intensity/colour (it knows where it placed the light) and availability;
 * `isAvailable()` is the sole authority for whether the light exists (Light Source Ownership Contract).
 *
 * Note: `AmbientLight` derives intensity/colour/radius/blend from the resolved **preset**; the source's
 * `getIntensity`/`getColor` exist for interface conformance (and any future driver use), while
 * `getPosition` and `isAvailable` are what the renderer actually consumes.
 *
 * STATUS — ADOPTED · DORMANT COMPOSITION INFRASTRUCTURE · NOT A PRODUCTION PLACEMENT.
 * Internal · not public API (never export from lighting/index.ts) · not routed · not mounted · zero
 * production footprint · tested · deterministic · reusable. Phase 3.6 (first persistent placement) is
 * DEFERRED — no palette-appropriate persistent surface exists yet. This factory waits, ready, for a
 * legitimate future placement. See docs/roadmaps/FIRST_PERSISTENT_PLACEMENT.md.
 */
export interface StaticLightInput {
  /** Container-relative CSS % where the light sits (the light's origin). Owned by the Experience. */
  position: { x: string; y: string };
  /** Base intensity 0–1 (interface conformance; presentation intensity comes from the preset). */
  intensity: number;
  /** Warm-light colour token (interface conformance; presentation colour comes from the preset). */
  color: string;
  /** Whether the light exists. Defaults to true. Sole existence authority (Light Source Ownership Contract). */
  available?: boolean;
}

/** Compose a `StaticLightSource` from a hand-placed light. Pure — no state, no side effects, no mount. */
export function createStaticLightSource(input: StaticLightInput): StaticLightSource {
  return {
    kind: "static",
    isAvailable: () => input.available ?? true,
    getPosition: () => input.position,
    getIntensity: () => input.intensity,
    getColor: () => input.color,
  };
}
