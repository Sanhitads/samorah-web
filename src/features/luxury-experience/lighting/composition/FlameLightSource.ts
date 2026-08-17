import type { FlameLightSource } from "../sources/lightSource";

/**
 * Composition Layer — FlameLightSource.
 *
 * NOT engine code, NOT test code — the in-between COMPOSITION layer:
 *   Platform Engine → **Composition Layer** → Experience.
 *
 * It composes the frozen public `LightSource` interface (via the typed `FlameLightSource` shape) to
 * represent light originating from a flame. It modifies **no** engine — `AmbientLight`,
 * `resolveAmbientLight()`, `Flame`, `LightingPreset`, `LightSource` are all untouched — and it is **not**
 * public API (deliberately NOT exported from `lighting/index.ts`). Phases 3.2–3.4 reuse it from here.
 *
 * For static lighting the flame's position/intensity/colour are fixed inputs (the Experience knows where
 * it placed the flame). `isAvailable()` reflects whether the flame is lit — the source is the sole
 * authority for whether a light exists (Light Source Ownership Contract).
 */
export interface FlameLightInput {
  /** Container-relative CSS % where the flame sits (the light's origin). */
  position: { x: string; y: string };
  /** Base intensity 0–1 (from the flame's state/config). */
  intensity: number;
  /** Warm-light colour (token / CSS var). */
  color: string;
  /** Whether the flame is currently lit. Defaults to true. */
  lit?: boolean;
}

/** Compose a `FlameLightSource` from a flame's placement. Pure — no state, no side effects, no mount. */
export function createFlameLightSource(input: FlameLightInput): FlameLightSource {
  return {
    kind: "flame",
    isAvailable: () => input.lit ?? true,
    getPosition: () => input.position,
    getIntensity: () => input.intensity,
    getColor: () => input.color,
  };
}
