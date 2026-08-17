"use client";

import "./intro.css";
import { Flame } from "../../flame/Flame";
import { INTRO_FLAME_AB } from "./introFlameAB.config";

/**
 * The intro overlay markup. Presentation only — the animation is entirely CSS (see intro.css); the
 * orchestration (gate, timers, dismiss, cleanup) lives in LuxuryExperience. `aria-hidden` so it is
 * ignored by assistive tech; `onSkip` fires on click (Esc is handled by the orchestrator).
 *
 * Mode B (PROTOTYPE, Phase 2.1 · Commit 2 — default OFF): the flame is the adopted Flame Primitive
 * (`variant="match"`, static) inside `.lux-intro__flame--adopted`. That wrapper carries the intro's own
 * `lux-flame` animation (opacity + scale + flicker + fade on the 2600 ms timeline) — so the INTRO owns
 * 100% of the choreography and the primitive supplies ONLY the visual (Presentation vs Experience). The
 * A/B harness is removed in Commit 4.
 */
export function IntroExperience({ text, onSkip }: { text: string; onSkip: () => void }) {
  return (
    <div className="lux-intro" aria-hidden="true" onClick={onSkip}>
      <div className="lux-intro__glow" />
      <div className="lux-intro__scene">
        <div className="lux-intro__flamewrap">
          <span className="lux-intro__spark" />
          {INTRO_FLAME_AB.mode === "B" ? (
            <span className="lux-intro__flame lux-intro__flame--adopted">
              <Flame variant="match" motionProfile="still" glow={false} size={32} />
            </span>
          ) : (
            <span className="lux-intro__flame" />
          )}
        </div>
        <p className="lux-intro__wordmark">{text}</p>
      </div>
    </div>
  );
}
