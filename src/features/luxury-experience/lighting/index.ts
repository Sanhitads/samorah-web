/**
 * Ambient Lighting Engine — public surface (Phase 3.0). Types + pure resolvers + the passive renderer.
 * NOT re-exported from the feature root and NOT mounted anywhere — fully inert until a placement phase.
 * Consumers (a future Experience) import from here and compose <AmbientLight> themselves.
 */
export { AmbientLight, type AmbientLightProps } from "./AmbientLight";
export {
  resolveLightingConfig,
  resolveLightingProfile,
  LIGHTING_PRESETS,
  LIGHTING_DEFAULTS,
  type LightingConfig,
  type LightingProfile,
  type LightingPreset,
  type BlendMode,
} from "./lighting.config";
export { resolveLightingTier, type LightingTier } from "./capability";
export {
  type LightSource,
  type StaticLightSource,
  type FlameLightSource,
  type CampaignLightSource,
  type CustomLightSource,
  type AnyLightSource,
} from "./sources/lightSource";
export { type LightDriver, type LightChannel, type LightModulation } from "./drivers/driver";
export { resolveAmbientLight, type AmbientLightPlacement } from "./experience";
