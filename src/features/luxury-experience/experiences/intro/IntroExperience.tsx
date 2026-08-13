"use client";

import "./intro.css";

/**
 * The intro overlay markup. Presentation only — the animation is entirely CSS (see intro.css); the
 * orchestration (gate, timers, dismiss, cleanup) lives in LuxuryExperience. `aria-hidden` so it is
 * ignored by assistive tech; `onSkip` fires on click (Esc is handled by the orchestrator).
 */
export function IntroExperience({ text, onSkip }: { text: string; onSkip: () => void }) {
  return (
    <div className="lux-intro" aria-hidden="true" onClick={onSkip}>
      <div className="lux-intro__glow" />
      <div className="lux-intro__scene">
        <div className="lux-intro__flamewrap">
          <span className="lux-intro__spark" />
          <span className="lux-intro__flame" />
        </div>
        <p className="lux-intro__wordmark">{text}</p>
      </div>
    </div>
  );
}
