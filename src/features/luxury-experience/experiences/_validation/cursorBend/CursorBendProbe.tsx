"use client";

import "./cursorBend.css";
import { useEffect, useRef } from "react";
import {
  AmbientLight,
  resolveAmbientLight,
  resolveLightingConfig,
  resolveLightingTier,
  type LightModulation,
} from "../../../lighting";
import { createFlameLightSource } from "../../../lighting/composition/FlameLightSource";
import { createCursorBendDriver } from "./cursorBendDriver";

/**
 * Phase 3.3 — Cursor Bend Validation · ISOLATION harness (never routed, never imported by production).
 *
 * Proves the approved chain end-to-end using ONLY frozen public APIs:
 *   createFlameLightSource → resolveAmbientLight() → <AmbientLight>   (all untouched)
 * The cursor bend lives ENTIRELY in this experience layer: the driver captures a bounded pointer signal and
 * the harness writes it to the experience-owned `--lux-bend-*` transform wrapper. No engine, Flame,
 * Composition Layer, or Experience Engine file is modified. Rendering the light is the frozen renderer's job;
 * placement + the bounded transform are the experience's — Presentation vs Experience.
 */
export function CursorBendProbe() {
  const containerRef = useRef<HTMLDivElement>(null);
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
    const container = containerRef.current;
    const wrap = wrapRef.current;
    if (!container || !wrap) return;

    // Capability governor (final vote): only the "on" tier bends; dim/off → static, no listener at all.
    if (resolveLightingTier() !== "on") return;
    // No fine pointer (touch) → no cursor bend.
    if (typeof window !== "undefined" && window.matchMedia && !window.matchMedia("(pointer: fine)").matches) return;

    const { attach } = createCursorBendDriver();
    const apply = (m: LightModulation) => {
      wrap.style.setProperty("--lux-bend-x", m.dx ?? "0px");
      wrap.style.setProperty("--lux-bend-y", m.dy ?? "0px");
    };
    return attach(container, apply);
  }, []);

  return (
    <div ref={containerRef} className="lux-cbv" aria-hidden="true">
      <div ref={wrapRef} className="lux-cbv__bendwrap">
        {placement ? (
          <AmbientLight preset={placement.preset} source={placement.source} className="lux-cbv__light" />
        ) : null}
      </div>
    </div>
  );
}
