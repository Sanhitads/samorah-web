/**
 * Luxury Experience Engine — public surface.
 *
 * Phase 1 exposes the engine core (config resolver, analytics seam, capability tiering, sound seam,
 * error boundary). The mounted `<LuxuryExperience />` component is exported once its experience lands
 * (commit ③). Delete this folder + the homepage mount to remove the feature entirely.
 */
export { resolveExperienceConfig, type ExperienceConfig, type ExperienceKind, type BrandMarkKind } from "./engine/config";
export { reportExperience, EXPERIENCE_EVENTS, type ExperiencePhase } from "./engine/reporting";
export { detectMotionTier, type MotionTier } from "./engine/capability";
export { silentSound, type SoundEngine } from "./engine/sound";
export { ExperienceBoundary } from "./engine/ExperienceBoundary";
