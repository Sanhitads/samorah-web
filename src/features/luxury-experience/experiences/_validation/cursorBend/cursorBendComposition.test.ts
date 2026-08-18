/**
 * Phase 3.3 — Cursor Bend Validation · composition proof (SSR).
 *
 * Proves the harness composes the frozen renderer through public APIs, keeps the light byte-identical to the
 * static baseline (detached determinism — SSR never runs the driver), and respects the Lighting Token
 * Ownership Contract (experience-owned `--lux-*`, never an `--lx-*` bend token).
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CursorBendProbe } from "./CursorBendProbe";
import { AmbientLight, resolveAmbientLight, resolveLightingConfig } from "../../../lighting";
import { createFlameLightSource } from "../../../lighting/composition/FlameLightSource";

const html = renderToStaticMarkup(createElement(CursorBendProbe));

describe("Phase 3.3 Cursor Bend Validation — composition via frozen public APIs", () => {
  it("composes and renders the frozen AmbientLight renderer", () => {
    expect(html).toContain("lx-light"); // the frozen renderer
    expect(html).toContain("lux-cbv__light"); // via the harness-supplied className
    expect(html).toContain("--lx-color-warm:var(--lux-color-amber)"); // v1.1 concrete, paintable token
  });

  it("wraps the light in the experience-owned bend wrapper", () => {
    expect(html).toContain("lux-cbv__bendwrap");
  });

  it("declares NO --lx-* bend token (Lighting Token Ownership respected)", () => {
    expect(html).not.toContain("--lx-bend");
  });

  it("detached (SSR) light output equals the static baseline — determinism preserved", () => {
    const source = createFlameLightSource({
      position: { x: "50%", y: "50%" },
      intensity: 0.16,
      color: "var(--lux-color-amber)",
      lit: true,
    });
    const placement = resolveAmbientLight(resolveLightingConfig({ enabled: true, profile: "premium" }), source);
    expect(placement).not.toBeNull();

    const baseline = renderToStaticMarkup(
      createElement(AmbientLight, { preset: placement?.preset ?? null, source, className: "lux-cbv__light" }),
    );
    expect(html).toContain(baseline); // the exact frozen-renderer output appears, unmodified, in the harness
  });
});
