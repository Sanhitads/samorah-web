/**
 * Capability / motion-tier detection.
 *
 * The engine chooses a tier BEFORE playing, so user experience always wins over animation:
 *   • "full"    — the cinematic timeline
 *   • "reduced" — a graceful minimal fade (respects prefers-reduced-motion; also used on low-power
 *                 devices that likely can't sustain 60fps)
 *   • "off"     — no experience at all
 *
 * Phase 1 is a PRE-EMPTIVE check (reduced-motion + coarse device signals). A runtime FPS-based
 * downgrade (measure a few frames, drop tier if janky) is a documented Phase-2 extension — the tier
 * model already supports it without a rewrite.
 */
export type MotionTier = "full" | "reduced" | "off";

interface NavigatorCapability {
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

/** SSR-safe: returns "full" on the server; the client re-evaluates after mount. */
export function detectMotionTier(): MotionTier {
  if (typeof window === "undefined") return "full";
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return "reduced";
    const nav = navigator as Navigator & NavigatorCapability;
    const cores = nav.hardwareConcurrency ?? 8;
    const memory = nav.deviceMemory ?? 8;
    // Low-power heuristic — a mid/low Android or memory-constrained device drops to the simple fade
    // rather than risk a janky cinematic sequence.
    if (cores <= 2 || memory <= 1) return "reduced";
    return "full";
  } catch {
    return "full";
  }
}
