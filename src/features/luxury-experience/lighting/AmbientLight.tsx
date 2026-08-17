import type { CSSProperties } from "react";
import "./lighting.css";
import type { LightingPreset } from "./lighting.config";
import type { LightSource } from "./sources/lightSource";

/**
 * Ambient Lighting Engine — the Light Renderer (Phase 3.0).
 *
 * A PRESENTATION renderer only (AmbientLight Renderer Responsibility Contract): it consumes one resolved
 * LightingPreset + one LightSource, renders the light field, applies compositor-safe CSS, and exposes
 * accessibility attributes — nothing else. It owns NO animation, timing, capability, replay, state,
 * listeners, rAF, timers, cursor/scroll logic, source impls, or driver impls. No hooks; deterministic.
 *
 * Renders ONLY when a valid resolved preset exists AND source.isAvailable() === true (Light Source
 * Ownership Contract). Otherwise returns null — never a fallback light, never a guessed default.
 *
 * Not mounted anywhere in Phase 3.0 — inert until a placement phase.
 */
export interface AmbientLightProps {
  preset?: LightingPreset | null;
  source?: LightSource | null;
  className?: string;
}

export function AmbientLight({ preset, source, className }: AmbientLightProps) {
  if (!preset || !source || !source.isAvailable()) return null;

  const { x, y } = source.getPosition();
  // Apply resolved preset values (+ source position) per instance via the --lx-* custom properties.
  // Only lighting.tokens.css DECLARES these; here the renderer CONSUMES them (Lighting Token Ownership).
  const style = {
    "--lx-x": x,
    "--lx-y": y,
    "--lx-radius": preset.radius,
    "--lx-intensity": String(preset.intensity),
    "--lx-falloff": preset.falloff,
    "--lx-color-warm": preset.color,
    "--lx-blend": preset.blend,
  } as CSSProperties;

  return <span className={className ? `lx-light ${className}` : "lx-light"} style={style} aria-hidden="true" />;
}
