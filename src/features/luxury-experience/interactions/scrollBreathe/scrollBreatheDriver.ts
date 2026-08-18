import type { LightDriver, LightModulation } from "../../lighting";
import { BREATH_BUDGET, clampToBreath } from "./breathBudget";

/**
 * Scroll Breathe · DRIVER (adopted · reusable interaction driver).
 *
 * Implements the frozen `LightDriver` interface unchanged — it MODULATES an existing light's INTENSITY within
 * the Breath Budget and does nothing else:
 *   - `channels: ["intensity"]` ONLY — it can never touch position / colour / profile / radius / blend.
 *   - `modulate()` returns a bounded `{ dIntensity }` (a delta, never an absolute value).
 *   - it creates no light, mounts nothing, and reads no source (Light Source Ownership Contract).
 *
 * "Breathe, not pulse": the breath swells with scroll velocity and, when scrolling stops, returns SMOOTHLY to
 * neutral (Scroll Idle Rule) — no overshoot, no lingering oscillation (the CSS transition eases; there is no
 * spring). Input capture is a passive, rAF-coalesced `scroll` listener owned HERE (the renderer owns no
 * listeners); it is removed on detach, along with any pending frame/idle timer. SSR-safe: no window/document
 * access at import — only inside `attach`, which an Experience calls from an effect.
 *
 * ADOPTED · DORMANT: this module is the sanctioned home for the validated capability. It is imported by no
 * production route or experience yet — a future reviewed placement phase attaches it to a persistent light.
 * It introduces NO runtime behaviour on its own.
 */

/** Gain: scroll velocity (px/frame) → opacity delta, before clamping. Impl choice; the clamp is the guard. */
const BREATH_GAIN = 0.0016;
/** Idle window (ms): after this long with no scroll event, the breath returns to neutral. */
const IDLE_MS = 140;

/** Pure breath calculation: map a scroll velocity (px) to a budget-bounded opacity delta. Testable in node. */
export function computeBreath(velocityPx: number, gain: number = BREATH_GAIN, budget: number = BREATH_BUDGET): number {
  if (!Number.isFinite(velocityPx)) return 0;
  return clampToBreath(Math.abs(velocityPx) * gain, budget);
}

/** The scroll signal source the driver reads from (window in production; a fake in tests). */
export interface ScrollTarget {
  addEventListener(type: "scroll", cb: () => void, opts?: { passive?: boolean }): void;
  removeEventListener(type: "scroll", cb: () => void): void;
  getScrollY(): number;
}

export interface ScrollBreatheHandle {
  readonly driver: LightDriver;
  attach(target: ScrollTarget, onModulate: (m: LightModulation) => void): () => void;
}

export function createScrollBreatheDriver(budget: number = BREATH_BUDGET): ScrollBreatheHandle {
  const state = { breath: 0 };

  const driver: LightDriver = {
    id: "scroll-breathe",
    channels: ["intensity"],
    // Driver Resolution Contract order (low → high): Scroll(10) resolves BEFORE Cursor(20).
    priority: 10,
    modulate: (): LightModulation => ({ dIntensity: state.breath }),
  };

  function attach(target: ScrollTarget, onModulate: (m: LightModulation) => void): () => void {
    let frame = 0;
    let idle: ReturnType<typeof setTimeout> | 0 = 0;
    let pending = false;
    let lastY = target.getScrollY(); // one-time read at attach (not in the handler)

    const toNeutral = () => {
      state.breath = 0;
      onModulate(driver.modulate()); // Scroll Idle Rule: smooth return to neutral (CSS eases; no oscillation)
    };

    const flush = () => {
      frame = 0;
      if (!pending) return;
      pending = false;
      const y = target.getScrollY(); // scroll read happens HERE (in the frame), never in the handler
      const velocity = Math.abs(y - lastY);
      lastY = y;
      state.breath = computeBreath(velocity, BREATH_GAIN, budget);
      onModulate(driver.modulate());
      if (idle) clearTimeout(idle);
      idle = setTimeout(toNeutral, IDLE_MS);
    };

    const onScroll = () => {
      pending = true;
      if (!frame) frame = requestAnimationFrame(flush); // coalesce to ≤ one write per frame
    };

    target.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      target.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      if (idle) clearTimeout(idle);
      state.breath = 0;
    };
  }

  return { driver, attach };
}
