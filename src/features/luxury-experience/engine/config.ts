/**
 * Luxury Experience Engine — configuration (single source the engine reads).
 *
 * Phase 1 ships a static default. The shape + `resolveExperienceConfig()` seam mirror the
 * `getSiteSettings` merge pattern, so a FUTURE CMS/DB layer can override every field
 * (enable/disable · duration · seasonal variant · replay policy) with ZERO engine changes.
 * The field set (`experienceId`, `version`, `replayPolicy`, `replayAfterDays`, `duration`) maps
 * one-to-one onto a future settings row — the admin screen supplies the values instead of this file.
 *
 * Two independent off-switches for operational safety:
 *   1. `NEXT_PUBLIC_ENABLE_LUXURY_EXPERIENCE=false` — build-time kill switch (redeploy to apply),
 *      usable before any CMS control exists.
 *   2. `DEFAULT.enabled` — the in-code flag (later CMS-driven).
 */
import { INTRO_TOTAL_MS } from "./motion.tokens";

/** Which experience the engine runs. Phase 1 = "intro"; future: "transition" | "ambient" | … */
export type ExperienceKind = "intro";

/** The reveal target for the brand mark — text today; the seam supports the rest without a rewrite. */
export type BrandMarkKind = "text" | "svg" | "animatedSvg" | "video";

/**
 * How often the experience replays for a returning visitor (Phase 1.1):
 *   - "once"            — play once, ever (a version bump does NOT bring it back).
 *   - "version"         — replay only when `version` changes (a deliberate re-launch). Original behaviour.
 *   - "version_or_days" — replay when `version` changes OR `replayAfterDays` have elapsed. LAUNCH DEFAULT.
 * Launch policy = first visit → show · frequent visits → skip · after `replayAfterDays` → show again ·
 * new campaign (version bump) → show immediately.
 */
export type ReplayPolicy = "once" | "version" | "version_or_days";

export interface ExperienceConfig {
  /** Master on/off (later CMS-driven). Combined with the env kill switch in resolveExperienceConfig(). */
  enabled: boolean;
  /** CMS instance identifier — maps to a future settings row's primary key. Static today. */
  experienceId: string;
  /** Which built-in experience the engine runs. */
  experience: ExperienceKind;
  /** Bump to re-show on a major launch (compared against the stored last-seen version). */
  version: number;
  /** Replay policy for returning visitors. */
  replayPolicy: ReplayPolicy;
  /** Day count used ONLY by the "version_or_days" policy. */
  replayAfterDays: number;
  /** Full-tier animation duration (ms) — the CMS seam for timing; matches the CSS token today. */
  duration: number;
  /** Brand-mark reveal target (Phase 1: text wordmark). */
  brandMark: { kind: BrandMarkKind; text: string };
  /** Hard failsafe (ms): the engine force-dismisses past this, whatever the animation state. */
  failsafeMs: number;
}

const DEFAULT: ExperienceConfig = {
  enabled: true,
  experienceId: "default",
  experience: "intro",
  version: 1,
  replayPolicy: "version_or_days", // launch policy: first visit + replay after `replayAfterDays` + on version change
  replayAfterDays: 30,
  duration: INTRO_TOTAL_MS,
  brandMark: { kind: "text", text: "SAMORAH" },
  failsafeMs: 5000,
};

/**
 * The concrete replay decision inputs, derived once from the policy so the client gate AND the
 * pre-paint inline script share identical logic (no drift → no flash / no wrong replay).
 *   - versionKey      — the current version as a string (storage-comparable, back-compat with old string values).
 *   - replayOnVersion — replay when the stored version differs (true for every policy except "once").
 *   - replayDays      — elapsed-days threshold, or null when the policy is not time-based.
 */
export interface ReplayRule {
  versionKey: string;
  replayOnVersion: boolean;
  replayDays: number | null;
}

export function resolveReplayRule(config: ExperienceConfig): ReplayRule {
  return {
    versionKey: String(config.version),
    replayOnVersion: config.replayPolicy !== "once",
    replayDays: config.replayPolicy === "version_or_days" ? config.replayAfterDays : null,
  };
}

/**
 * The one place the engine resolves its config. Applies the env kill switch over the default.
 * FUTURE: merge a CMS/DB layer here (same deep-merge approach as siteSettingsService) — the
 * engine consumes the result and needs no change.
 */
export function resolveExperienceConfig(): ExperienceConfig {
  const envDisabled = process.env.NEXT_PUBLIC_ENABLE_LUXURY_EXPERIENCE === "false";
  return { ...DEFAULT, enabled: DEFAULT.enabled && !envDisabled };
}
