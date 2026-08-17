/**
 * Ambient Lighting Engine — Driver interface (Phase 3.0, architecture only; NO drivers implemented).
 *
 * A driver MODULATES an existing light within bounded deltas — it never creates a light, never replaces the
 * source, and never keeps rendering once the source is unavailable (Light Source Ownership + Driver
 * Resolution Contracts). Cursor and Scroll are FUTURE drivers (3.2 / 3.3); none exist yet. No runtime
 * behavior, no listeners, no timers, no rAF here.
 */

/** Which value a driver may nudge. */
export type LightChannel = "position" | "intensity" | "color";

/** A bounded modulation a driver contributes (deltas, never absolute replacements). */
export interface LightModulation {
  /** Bounded position delta (CSS length, e.g. "4px" / "0.5%"). */
  dx?: string;
  dy?: string;
  /** Bounded intensity delta (small, so lighting stays subtle). */
  dIntensity?: number;
}

/** A future interaction driver. Higher `priority` resolves later (see Driver Resolution Contract). */
export interface LightDriver {
  readonly id: string;
  readonly channels: readonly LightChannel[];
  readonly priority: number;
  /** Return this driver's bounded modulation. Never replaces the source; never keeps a dead light alive. */
  modulate(): LightModulation;
}
