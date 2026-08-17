/**
 * Ambient Lighting Engine — configuration + profiles (Phase 3.0, architecture only).
 *
 * A LightingProfile resolves to a COMPLETE LightingPreset (radius · intensity · falloff · color · blend),
 * so the renderer is profile-agnostic — it consumes resolved values only, never a profile name. CMS chooses
 * a profile; it never sets five values (CMS Responsibility Contract). resolveLightingConfig() is the CMS /
 * settings seam (same pattern as resolveFlameConfig / resolveExperienceConfig). Presentation only — no
 * animation, no drivers, no runtime behavior; nothing here mounts or renders.
 */

export type BlendMode = "normal" | "screen" | "soft-light";

/** Named lighting profiles (CMS-selectable). Each resolves to a full preset below. */
export type LightingProfile = "disabled" | "subtle" | "premium" | "campaign" | "seasonal";

/** The complete, renderer-ready values a profile resolves to. */
export interface LightingPreset {
  /** Light-field radius (CSS length; relative units for responsive scaling). */
  radius: string;
  /** Base intensity 0–1 (kept low — lighting is never the focal point). */
  intensity: number;
  /** Gradient falloff — the transparent stop (e.g. "70%"). */
  falloff: string;
  /** Warm-light colour (a Motion-Design-System token / CSS var). */
  color: string;
  /** Mix-blend-mode (with a `normal` fallback at render time). */
  blend: BlendMode;
}

const WARM = "var(--lx-color-warm)";

/** Profile → preset. Deliberately subtle; the Focal Point Rule caps intensity. */
export const LIGHTING_PRESETS: Record<LightingProfile, LightingPreset> = {
  disabled: { radius: "0px", intensity: 0, falloff: "0%", color: WARM, blend: "normal" },
  subtle: { radius: "clamp(120px, 28vmin, 360px)", intensity: 0.1, falloff: "68%", color: WARM, blend: "soft-light" },
  premium: { radius: "clamp(160px, 34vmin, 460px)", intensity: 0.16, falloff: "72%", color: WARM, blend: "screen" },
  campaign: { radius: "clamp(160px, 34vmin, 460px)", intensity: 0.16, falloff: "72%", color: WARM, blend: "screen" },
  seasonal: { radius: "clamp(160px, 34vmin, 460px)", intensity: 0.16, falloff: "72%", color: WARM, blend: "screen" },
};

export function resolveLightingProfile(profile: LightingProfile): LightingPreset {
  return LIGHTING_PRESETS[profile];
}

/** Engine config — master enable + the active profile. Position lives with the LightSource, not here. */
export interface LightingConfig {
  enabled: boolean;
  profile: LightingProfile;
}

/** Dormant by default: disabled + the "disabled" profile → nothing renders. */
export const LIGHTING_DEFAULTS: LightingConfig = { enabled: false, profile: "disabled" };

/** The single seam the engine reads; a future CMS/campaign layer merges over the defaults — no code change. */
export function resolveLightingConfig(overrides?: Partial<LightingConfig>): LightingConfig {
  return { ...LIGHTING_DEFAULTS, ...(overrides ?? {}) };
}
