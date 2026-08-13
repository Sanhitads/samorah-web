/**
 * Luxury Experience Engine — configuration (single source the engine reads).
 *
 * Phase 1 ships a static default. The shape + `resolveExperienceConfig()` seam mirror the
 * `getSiteSettings` merge pattern, so a FUTURE CMS/DB layer can override every field
 * (enable/disable · duration · seasonal variant · replay policy) with ZERO engine changes.
 *
 * Two independent off-switches for operational safety:
 *   1. `NEXT_PUBLIC_ENABLE_LUXURY_EXPERIENCE=false` — build-time kill switch (redeploy to apply),
 *      usable before any CMS control exists.
 *   2. `DEFAULT.enabled` — the in-code flag (later CMS-driven).
 */

/** Which experience the engine runs. Phase 1 = "intro"; future: "transition" | "ambient" | … */
export type ExperienceKind = "intro";

/** The reveal target for the brand mark — text today; the seam supports the rest without a rewrite. */
export type BrandMarkKind = "text" | "svg" | "animatedSvg" | "video";

export interface ExperienceConfig {
  /** Master on/off (later CMS-driven). Combined with the env kill switch in resolveExperienceConfig(). */
  enabled: boolean;
  /** The active experience. */
  experience: ExperienceKind;
  /** Replay after N days; `null` = play once, ever. */
  replayAfterDays: number | null;
  /** Bump to re-show the experience on a major launch (stored alongside the seen-flag). */
  version: string;
  /** Brand-mark reveal target (Phase 1: text wordmark). */
  brandMark: { kind: BrandMarkKind; text: string };
  /** Hard failsafe (ms): the engine force-dismisses past this, whatever the animation state. */
  failsafeMs: number;
}

const DEFAULT: ExperienceConfig = {
  enabled: true,
  experience: "intro",
  replayAfterDays: null,
  version: "1",
  brandMark: { kind: "text", text: "SAMORAH" },
  failsafeMs: 5000,
};

/**
 * The one place the engine resolves its config. Applies the env kill switch over the default.
 * FUTURE: merge a CMS/DB layer here (same deep-merge approach as siteSettingsService) — the
 * engine consumes the result and needs no change.
 */
export function resolveExperienceConfig(): ExperienceConfig {
  const envDisabled = process.env.NEXT_PUBLIC_ENABLE_LUXURY_EXPERIENCE === "false";
  return { ...DEFAULT, enabled: DEFAULT.enabled && !envDisabled };
}
