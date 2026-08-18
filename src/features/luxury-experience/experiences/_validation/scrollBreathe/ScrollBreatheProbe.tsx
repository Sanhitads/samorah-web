"use client";

import "./scrollBreathe.css";
import { useEffect, useRef } from "react";
import {
  AmbientLight,
  resolveAmbientLight,
  resolveLightingConfig,
  resolveLightingTier,
  type LightModulation,
} from "../../../lighting";
import { createFlameLightSource } from "../../../lighting/composition/FlameLightSource";
import { createScrollBreatheDriver, type ScrollTarget } from "./scrollBreatheDriver";

/**
 * Phase 3.4 — Scroll Breathe Validation · ISOLATION harness (never routed, never imported by production).
 *
 * Proves the approved chain using ONLY frozen public APIs:
 *   createFlameLightSource → resolveAmbientLight() → <AmbientLight>   (all untouched)
 * The scroll breath lives ENTIRELY in this experience layer: the driver captures a bounded scroll signal and
 * the harness writes it to the experience-owned `--lux-breathe` OPACITY wrapper. No engine, Flame,
 * Composition Layer, Experience Engine, or the frozen Cursor Bend harness is modified. Rendering the light is
 * the frozen renderer's job; the bounded opacity is the experience's — Presentation vs Experience.
 */
export function ScrollBreatheProbe() {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Static composition — identical whether or not the driver ever attaches (detached determinism).
  const placement = resolveAmbientLight(
    resolveLightingConfig({ enabled: true, profile: "premium" }),
    createFlameLightSource({
      position: { x: "50%", y: "50%" },
      intensity: 0.16,
      color: "var(--lux-color-amber)",
      lit: true,
    }),
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Capability governor (final vote): only the "on" tier breathes; dim/off → static, no listener.
    if (resolveLightingTier() !== "on") return;
    if (typeof window === "undefined") return;

    const target: ScrollTarget = {
      addEventListener: (t, cb, o) => window.addEventListener(t, cb, o),
      removeEventListener: (t, cb) => window.removeEventListener(t, cb),
      getScrollY: () => window.scrollY,
    };
    const { attach } = createScrollBreatheDriver();
    const apply = (m: LightModulation) => wrap.style.setProperty("--lux-breathe", String(m.dIntensity ?? 0));
    return attach(target, apply);
  }, []);

  return (
    <div className="lux-sbv" aria-hidden="true">
      <div className="lux-sbv__stage">
        <div ref={wrapRef} className="lux-sbv__breathwrap">
          {placement ? (
            <AmbientLight preset={placement.preset} source={placement.source} className="lux-sbv__light" />
          ) : null}
        </div>
      </div>
      <div className="lux-sbv__scroll-space" />
    </div>
  );
}
