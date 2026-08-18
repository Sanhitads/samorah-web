/**
 * Ambient Lighting Engine v1.1 — renderer contract regression (ADR-0009).
 *
 * Guards the self-referential-color fix and, more generally, the renderer's presentation contract:
 *   1. NO emitted CSS custom property references itself (any `--*`, name-independent — protects future tokens).
 *   2. Golden renderer snapshot — the emitted style equals EXACTLY the resolved preset values + source position
 *      (catches accidental renderer drift).
 *   3. Public API shape unchanged — LightingPreset keys/type are stable.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AmbientLight } from "../AmbientLight";
import { resolveLightingProfile, LIGHTING_PRESETS, type LightingProfile } from "../lighting.config";
import type { LightSource } from "../sources/lightSource";

const source = (x = "50%", y = "60%"): LightSource => ({
  kind: "static",
  isAvailable: () => true,
  getPosition: () => ({ x, y }),
  getIntensity: () => 0.5,
  getColor: () => "var(--lux-color-amber)",
});

const PROFILES = Object.keys(LIGHTING_PRESETS) as LightingProfile[];

const render = (profile: LightingProfile, x?: string, y?: string) =>
  renderToStaticMarkup(createElement(AmbientLight, { preset: resolveLightingProfile(profile), source: source(x, y) }));

/** The AmbientLight renders a single element → grab its inline style string. */
const styleOf = (html: string): string => html.match(/style="([^"]*)"/)?.[1] ?? "";

/** Parse `--name:value;` declarations into an object (custom properties only). */
function customProps(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const name = decl.slice(0, i).trim();
    if (name.startsWith("--")) out[name] = decl.slice(i + 1).trim();
  }
  return out;
}

describe("AmbientLight v1.1 — renderer contract regression", () => {
  it("1) no emitted CSS custom property references itself (any --*, all profiles)", () => {
    for (const profile of PROFILES) {
      const props = customProps(styleOf(render(profile)));
      for (const [name, value] of Object.entries(props)) {
        // e.g. must never emit `--lx-color-warm: var(--lx-color-warm)`
        expect(value, `${profile} · ${name} is self-referential`).not.toBe(`var(${name})`);
      }
    }
  });

  it("2) golden renderer snapshot — emits exactly the resolved preset values + source position", () => {
    const p = resolveLightingProfile("premium");
    expect(customProps(styleOf(render("premium", "50%", "60%")))).toEqual({
      "--lx-x": "50%",
      "--lx-y": "60%",
      "--lx-radius": p.radius,
      "--lx-intensity": String(p.intensity),
      "--lx-falloff": p.falloff,
      "--lx-color-warm": "var(--lux-color-amber)", // the fixed, non-self-referential shared token
      "--lx-blend": p.blend,
    });
  });

  it("3) public API shape unchanged — LightingPreset keys + color type", () => {
    const p = resolveLightingProfile("premium");
    expect(Object.keys(p).sort()).toEqual(["blend", "color", "falloff", "intensity", "radius"]);
    expect(typeof p.color).toBe("string");
  });
});
