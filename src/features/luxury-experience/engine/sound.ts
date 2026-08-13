/**
 * Sound seam for the Luxury Experience Engine.
 *
 * Phase 1 plays NO audio and never autoplays. The interface + a disabled no-op implementation exist
 * so a future phase can add (e.g.) a subtle match-strike cue via config + a real implementation,
 * without changing any experience code. Audio would always be user-gated, never autoplayed.
 */
export interface SoundEngine {
  readonly enabled: boolean;
  play(cue: string): void;
  dispose(): void;
}

/** The Phase-1 implementation: does nothing. */
export const silentSound: SoundEngine = {
  enabled: false,
  play() {},
  dispose() {},
};
