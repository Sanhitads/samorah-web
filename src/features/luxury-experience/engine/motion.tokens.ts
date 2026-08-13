/**
 * Motion Design System — timing tokens (JS mirror of motion.tokens.css).
 *
 * The engine's JS timers read the SAME numbers the CSS keyframes use, so the animation and the
 * failsafe/dismiss timers can never diverge across browsers (only normal frame-level rendering
 * variance applies). These are the shared timing tokens for ALL future luxury motion — not intro-only.
 */

/** Absolute keyframe boundaries (ms from start) — the approved storyboard. Total = fade. */
export const INTRO_TIMELINE = {
  dark: 300,
  spark: 450,
  strike: 800,
  flame: 1400,
  spread: 2000,
  logo: 2400,
  fade: 2600,
} as const;

/** Full cinematic duration (ms). */
export const INTRO_TOTAL_MS = INTRO_TIMELINE.fade;

/** Reduced / low-power minimal fallback: wordmark fades in, overlay fades out. No transforms. */
export const REDUCED_TIMELINE = { logo: 200, fade: 400 } as const;
export const REDUCED_TOTAL_MS = REDUCED_TIMELINE.fade;
