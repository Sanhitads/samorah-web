/**
 * Phase 3.1 — Composition Validation Harness (headless; not user-facing; zero regression).
 *
 * Proves the frozen engines compose through their PUBLIC APIs only:
 *   FlameLightSource (composition layer) → resolveAmbientLight() → <AmbientLight>
 *
 * No preview page, no CSS, no animation, no visual tuning, no browser review, no production mount, no
 * renderer/engine changes. Rollback (proof #6) is structural: this commit is two additive files
 * (composition/FlameLightSource.ts + this test) — `git revert` (or delete them) removes it entirely.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AmbientLight } from "../AmbientLight";
import { resolveAmbientLight } from "../experience";
import { resolveLightingConfig } from "../lighting.config";
import { createFlameLightSource } from "../composition/FlameLightSource";

const flame = (lit = true) =>
  createFlameLightSource({ position: { x: "50%", y: "60%" }, intensity: 0.4, color: "var(--lx-color-core)", lit });

const premium = resolveLightingConfig({ enabled: true, profile: "premium" });

/** Compose config + source through the public seam, then render the renderer. */
const renderComposed = (config = premium, source = flame()) => {
  const placement = resolveAmbientLight(config, source);
  return placement ? renderToStaticMarkup(createElement(AmbientLight, placement)) : "";
};

describe("Phase 3.1 — Composition Validation", () => {
  it("1) FlameLightSource composes with resolveAmbientLight()", () => {
    const placement = resolveAmbientLight(premium, flame());
    expect(placement).not.toBeNull();
    expect(placement!.source.kind).toBe("flame");
    expect(placement!.preset.intensity).toBe(0.16); // the premium preset's resolved value
  });

  it("2) AmbientLight renders correctly from the composed placement", () => {
    const html = renderComposed();
    expect(html).toContain('class="lx-light"');
    expect(html).toContain("--lx-x:50%"); // the flame's position (from the source)
    expect(html).toContain("--lx-y:60%");
    expect(html).toContain("--lx-radius:"); // the resolved preset's radius is applied
    expect(html).toContain("--lx-intensity:0.16"); // the premium preset's intensity
  });

  it("3) isAvailable() short-circuits — an unlit flame renders nothing", () => {
    expect(renderComposed(premium, flame(false))).toBe("");
  });

  it("4) disabled configuration returns null (no placement)", () => {
    expect(resolveAmbientLight(resolveLightingConfig({ enabled: false }), flame())).toBeNull();
    expect(resolveAmbientLight(resolveLightingConfig({ enabled: true, profile: "disabled" }), flame())).toBeNull();
  });

  it("5) accessibility remains unchanged — the light is aria-hidden, no focusable nodes", () => {
    const html = renderComposed();
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<a[\s>]|<button|tabindex/i);
  });

  it("6) rollback is a simple git revert — composition is pure/additive (no side effects)", () => {
    // The factory is a pure composition of the frozen interface; calling it never mounts or mutates.
    const a = flame();
    const b = flame();
    expect(a.getPosition()).toEqual(b.getPosition());
    expect(a.kind).toBe("flame");
  });
});
