/**
 * Luxury Experience Engine — public surface.
 *
 * Phase 1 exposes the engine core (config resolver, analytics seam, capability tiering, sound seam,
 * error boundary). The mounted `<LuxuryExperience />` component is exported once its experience lands
 * (commit ③). Delete this folder + the homepage mount to remove the feature entirely.
 */
export {
  resolveExperienceConfig,
  resolveReplayRule,
  type ExperienceConfig,
  type ExperienceKind,
  type BrandMarkKind,
  type ReplayPolicy,
  type ReplayRule,
} from "./engine/config";
export { reportExperience, EXPERIENCE_EVENTS, type ExperiencePhase } from "./engine/reporting";
export { detectMotionTier, type MotionTier } from "./engine/capability";
export { silentSound, type SoundEngine } from "./engine/sound";
export { ExperienceBoundary } from "./engine/ExperienceBoundary";
export { LuxuryExperience } from "./LuxuryExperience";

// Phase 2 — Luxury Flame Primitive (reusable decorative SVG+CSS flame; no production mount).
export { Flame, type FlameProps } from "./flame/Flame";
export {
  resolveFlameConfig,
  FLAME_DEFAULTS,
  type FlameConfig,
  type FlameVariant,
  type FlameTheme,
  type FlameMotionProfile,
  type FlameSize,
} from "./flame/flame.config";
