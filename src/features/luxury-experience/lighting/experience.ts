import { resolveLightingProfile, type LightingConfig, type LightingPreset } from "./lighting.config";
import type { LightSource } from "./sources/lightSource";

/**
 * Ambient Lighting Engine — Experience API (Phase 3.0, architecture only; pure, no runtime behavior).
 *
 * The sanctioned way an Experience composes ambient lighting (Experience Ownership Contract — only an
 * Experience composes <AmbientLight>): resolve a LightingConfig + a LightSource into the renderer's props,
 * or `null` when lighting is disabled (so the Experience renders nothing). Pure function — no state, no
 * mount, no side effects, no hidden state. The engine never mounts itself; the Experience owns placement.
 */
export interface AmbientLightPlacement {
  preset: LightingPreset;
  source: LightSource;
}

export function resolveAmbientLight(config: LightingConfig, source: LightSource): AmbientLightPlacement | null {
  if (!config.enabled || config.profile === "disabled") return null;
  return { preset: resolveLightingProfile(config.profile), source };
}
