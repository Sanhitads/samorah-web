import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AmbientLight } from "./AmbientLight";
import { resolveLightingProfile } from "./lighting.config";
import type { LightSource } from "./sources/lightSource";

const premium = resolveLightingProfile("premium");
const disabled = resolveLightingProfile("disabled");

/** A minimal test LightSource (no engine source implementations exist in Phase 3.0). */
function testSource(over: Partial<{ available: boolean; x: string; y: string }> = {}): LightSource {
  return {
    kind: "static",
    isAvailable: () => over.available ?? true,
    getPosition: () => ({ x: over.x ?? "40%", y: over.y ?? "55%" }),
    getIntensity: () => 0.5,
    getColor: () => "var(--lx-color-core)",
  };
}

const render = (props: Parameters<typeof AmbientLight>[0]) =>
  renderToStaticMarkup(createElement(AmbientLight, props));

describe("AmbientLight — rendering rules", () => {
  it("returns null when no source", () => {
    expect(render({ preset: premium, source: null })).toBe("");
  });
  it("returns null when no preset", () => {
    expect(render({ preset: null, source: testSource() })).toBe("");
  });
  it("returns null when isAvailable() is false (Light Source Ownership Contract)", () => {
    expect(render({ preset: premium, source: testSource({ available: false }) })).toBe("");
  });
  it("renders when a valid preset + available source are supplied", () => {
    expect(render({ preset: premium, source: testSource() })).not.toBe("");
  });
});

describe("AmbientLight — decorative & layout-safe", () => {
  const html = render({ preset: premium, source: testSource() });
  it("is aria-hidden", () => {
    expect(html).toContain('aria-hidden="true"');
  });
  it("carries the absolute-positioning class (pointer-events/absolute live in .lx-light)", () => {
    expect(html).toContain('class="lx-light"');
  });
  it("is a single element with no focusable / interactive nodes", () => {
    expect(html.match(/<span/g)?.length).toBe(1);
    expect(html).not.toMatch(/<a[\s>]|<button|tabindex|<div/i);
  });
});

describe("AmbientLight — consumes only resolved preset values (+ source position)", () => {
  it("reflects the resolved preset's radius/intensity/falloff/color/blend and the source position", () => {
    const html = render({ preset: premium, source: testSource({ x: "12%", y: "88%" }) });
    expect(html).toContain(`--lx-radius:${premium.radius}`);
    expect(html).toContain(`--lx-intensity:${premium.intensity}`);
    expect(html).toContain(`--lx-falloff:${premium.falloff}`);
    expect(html).toContain(`--lx-color-warm:${premium.color}`);
    expect(html).toContain(`--lx-blend:${premium.blend}`);
    expect(html).toContain("--lx-x:12%");
    expect(html).toContain("--lx-y:88%");
  });
  it("stays invisible with the default (disabled) preset — intensity 0", () => {
    const html = render({ preset: disabled, source: testSource() });
    expect(html).toContain("--lx-intensity:0");
  });
});

describe("AmbientLight — deterministic", () => {
  it("same input → same output", () => {
    const a = render({ preset: premium, source: testSource() });
    const b = render({ preset: premium, source: testSource() });
    expect(a).toBe(b);
  });
});
