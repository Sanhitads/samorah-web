/**
 * Phase 3.6 Commit 1 — composition-layer StaticLightSource.
 *
 * Proves conformance to the FROZEN LightSource interface and that it composes through the existing public
 * resolver/renderer path — an available source renders, an unavailable source renders NOTHING (the renderer
 * enforces Light Source Ownership). This unavailable-path is exactly how the Phase 3.6 capability gate will
 * work: the existing capability governor sets `available` (off → unavailable → no AmbientLight).
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createStaticLightSource } from "./StaticLightSource";
import { AmbientLight, resolveAmbientLight, resolveLightingConfig } from "..";

const baseInput = { position: { x: "50%", y: "42%" }, intensity: 0.1, color: "var(--lux-color-amber)" };

const renderWith = (available: boolean) => {
  const source = createStaticLightSource({ ...baseInput, available });
  const placement = resolveAmbientLight(resolveLightingConfig({ enabled: true, profile: "subtle" }), source);
  return { placement, source };
};

describe("createStaticLightSource — frozen LightSource interface conformance", () => {
  it("implements the StaticLightSource shape and echoes its inputs", () => {
    const s = createStaticLightSource({ ...baseInput, available: true });
    expect(s.kind).toBe("static");
    expect(s.isAvailable()).toBe(true);
    expect(s.getPosition()).toEqual({ x: "50%", y: "42%" });
    expect(s.getIntensity()).toBe(0.1);
    expect(s.getColor()).toBe("var(--lux-color-amber)");
  });

  it("defaults availability to true when omitted", () => {
    expect(createStaticLightSource(baseInput).isAvailable()).toBe(true);
  });

  it("is SSR-safe and pure — no browser APIs, no state (constructing it touches nothing global)", () => {
    // Would throw if it referenced window/document/timers at construction.
    expect(() => createStaticLightSource({ ...baseInput, available: false })).not.toThrow();
  });
});

describe("createStaticLightSource — composition through the existing public resolver/renderer path", () => {
  it("an AVAILABLE source composes and renders via the frozen public APIs", () => {
    const { placement, source } = renderWith(true);
    expect(placement).not.toBeNull();
    const html = renderToStaticMarkup(createElement(AmbientLight, { preset: placement?.preset ?? null, source }));
    expect(html).toContain("lx-light"); // the frozen renderer drew the light
    expect(html).toContain("--lx-x:50%"); // the SOURCE's position drove it (experience-owned)
    expect(html).toContain("--lx-color-warm:var(--lux-color-amber)"); // the `subtle` preset colour
  });

  it("an UNAVAILABLE source renders NO light (renderer enforces Light Source Ownership)", () => {
    const { placement, source } = renderWith(false);
    expect(placement).not.toBeNull(); // the resolver is availability-agnostic…
    const html = renderToStaticMarkup(createElement(AmbientLight, { preset: placement?.preset ?? null, source }));
    expect(html).toBe(""); // …the renderer returns null when the source is unavailable → capability OFF path
  });

  it("is deterministic — identical inputs produce identical render output", () => {
    const mk = () => {
      const { placement, source } = renderWith(true);
      return renderToStaticMarkup(createElement(AmbientLight, { preset: placement?.preset ?? null, source }));
    };
    expect(mk()).toBe(mk());
  });
});
