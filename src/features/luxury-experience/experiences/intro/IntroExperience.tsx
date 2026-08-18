"use client";

import "./intro.css";
import { Flame } from "../../flame/Flame";
import { AmbientLight, resolveAmbientLight, resolveLightingConfig } from "../../lighting";
import { createFlameLightSource } from "../../lighting/composition/FlameLightSource";

/**
 * The intro overlay markup. Presentation only — the animation is entirely CSS (see intro.css); the
 * orchestration (gate, timers, dismiss, cleanup) lives in LuxuryExperience. `aria-hidden` so it is
 * ignored by assistive tech; `onSkip` fires on click (Esc is handled by the orchestrator).
 *
 * The flame is the canonical Luxury Flame Primitive (`variant="match"`, static). The intro owns 100% of
 * the choreography: `.lux-intro__flame` is the ignition wrapper — it carries the `lux-flame` animation
 * (opacity + scale + flicker + fade on the 2600 ms timeline). The primitive supplies ONLY the visual
 * (Presentation vs Experience). See docs/roadmaps/SIGNATURE_FLAME_ADOPTION.md.
 *
 * Ambient illumination (adopted · Phase 3.2): the flame casts a warm light BEHIND itself, composed from the
 * frozen public APIs — Experience → FlameLightSource → resolveAmbientLight() → AmbientLight. The Intro owns
 * the source + position/layering; the renderer is passive and never animated (Light Lifecycle Rule). It
 * coexists with — never replaces — `.lux-intro__glow`. See docs/roadmaps/SIGNATURE_INTRO_AMBIENT_ILLUMINATION.md.
 */
export function IntroExperience({ text, onSkip }: { text: string; onSkip: () => void }) {
  const ambient = resolveAmbientLight(
    resolveLightingConfig({ enabled: true, profile: "premium" }),
    createFlameLightSource({ position: { x: "50%", y: "50%" }, intensity: 0.16, color: "var(--lux-color-amber)", lit: true }),
  );

  return (
    <div className="lux-intro" aria-hidden="true" onClick={onSkip}>
      <div className="lux-intro__glow" />
      <div className="lux-intro__scene">
        <div className="lux-intro__flamewrap">
          {ambient ? (
            <AmbientLight preset={ambient.preset} source={ambient.source} className="lux-intro__ambient" />
          ) : null}
          <span className="lux-intro__spark" />
          <span className="lux-intro__flame">
            <Flame variant="match" motionProfile="still" size={34} />
          </span>
        </div>
        <p className="lux-intro__wordmark">{text}</p>
      </div>
    </div>
  );
}
