/**
 * Luxury Flame Primitive — configuration model (Phase 2).
 *
 * A design-system PRIMITIVE (not an engine): pure SVG + CSS, decorative, reusable anywhere. The
 * config shape mirrors Phase 1's resolveExperienceConfig() seam so a FUTURE CMS/DB layer can drive it
 * (campaign themes, per-placement motion) with ZERO code change.
 *
 * Four independent layers — each replaceable without touching the others:
 *   Flame → variant (silhouette) → theme (skin/palette) → motionProfile (motion)
 *
 * ── Non-Goals (Phase 2) ─────────────────────────────────────────────────────────────────────────
 * Intentionally EXCLUDED this phase (documented so they are never assumed complete):
 *   • physics simulation / fluid dynamics
 *   • particles / embers / smoke
 *   • JavaScript animation loop (rAF)            (motion is CSS-only by design)
 *   • cursor or pointer interaction              (Phase 3 — cursor-reactive lighting)
 *   • automatic capability-based motion selection (tier → motionProfile is documented INTENT only)
 *   • CMS / DB integration                        (the resolve seam exists; nothing is wired)
 *   • sound
 *   • production mounts                           (primitive only — no page renders it in Phase 2)
 *   • theme switching / seasonal themes           (only "default" is built)
 *   • non-classic variants                        (tall/short/ceramic/luxury are typed, not drawn)
 *
 * Built for real in Phase 2: variant "classic" · theme "default" · motionProfile still|classic|signature
 * · sizes xs–xl · optional glow/sway. Everything else is TYPED and DEFAULTED only.
 */

/** Silhouette layer. Only "classic" is drawn in Phase 2; the rest are typed for future geometry. */
export type FlameVariant = "classic" | "tall" | "short" | "ceramic" | "luxury";

/** Skin/palette layer — seasonal campaigns live here, NOT as variants. Only "default" is built. */
export type FlameTheme = "default" | "light" | "dark" | "luxury" | "seasonal";

/** Motion layer — names what changes. All three are built. */
export type FlameMotionProfile = "still" | "classic" | "signature";

/** Named size tokens (see flame.tokens.css); a raw number (px) overrides. */
export type FlameSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface FlameConfig {
  /** Silhouette. */
  variant: FlameVariant;
  /** Skin/palette. */
  theme: FlameTheme;
  /** Motion profile. */
  motionProfile: FlameMotionProfile;
  /** Named token or explicit px. */
  size: FlameSize | number;
  /** Render the glow / light radius. */
  glow: boolean;
  /** Slow organic horizontal drift (within the Motion Spec caps). */
  sway: boolean;
}

export const FLAME_DEFAULTS: FlameConfig = {
  variant: "classic",
  theme: "default",
  motionProfile: "classic",
  size: "md",
  glow: true,
  sway: true,
};

/**
 * The single seam the primitive reads. Phase 2 merges partial overrides over the defaults; a FUTURE
 * CMS/campaign layer merges here too (same pattern as resolveExperienceConfig) — no code change.
 */
export function resolveFlameConfig(overrides?: Partial<FlameConfig>): FlameConfig {
  return { ...FLAME_DEFAULTS, ...(overrides ?? {}) };
}
