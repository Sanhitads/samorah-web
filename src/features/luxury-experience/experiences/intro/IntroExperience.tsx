"use client";

import "./intro.css";
import { Flame } from "../../flame/Flame";
import { AmbientLight, resolveAmbientLight, resolveLightingConfig } from "../../lighting";
import { createFlameLightSource } from "../../lighting/composition/FlameLightSource";
import { INTRO_AMBIENT_AB } from "./introAmbientAB.config";

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
 * Phase 3.2 A/B harness (PROTOTYPE, built fresh against Ambient Lighting Engine v1.1; default Mode A →
 * nothing added). Mode B composes an ambient illumination BEHIND the flame from the frozen public APIs —
 * Experience → FlameLightSource → resolveAmbientLight() → AmbientLight. The Intro owns the source lifecycle
 * + position/layering; the renderer stays passive and is never animated (Light Lifecycle Rule). It coexists
 * with — never replaces — `.lux-intro__glow`. See docs/roadmaps/SIGNATURE_INTRO_AMBIENT_ILLUMINATION.md.
 */
export function IntroExperience({ text, onSkip }: { text: string; onSkip: () => void }) {
  // Default Mode A → null (byte-identical intro). Mode B composes a visible ambient illumination (v1.1).
  const ambient =
    INTRO_AMBIENT_AB.mode === "B"
      ? resolveAmbientLight(
          resolveLightingConfig({ enabled: true, profile: "premium" }),
          createFlameLightSource({ position: { x: "50%", y: "50%" }, intensity: 0.16, color: "var(--lux-color-amber)", lit: true }),
        )
      : null;

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
