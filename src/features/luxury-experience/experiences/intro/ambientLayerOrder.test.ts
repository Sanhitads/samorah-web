/**
 * Phase 3.2 — explicit assertion of the intro ambient LAYER ORDER (Mode B), so it is never left implicit.
 *
 * Intended order (front → back): Spark · Flame · AmbientLight · Background.
 * Phase 3.2's invariant: the AmbientLight is the BACKMOST overlay — behind both the Flame and the Spark,
 * in front of the Background (ambient < spark < flame in DOM → the flame's transform stacking context keeps
 * it on top). Forces Mode B via a module mock (the harness itself defaults to Mode A). `vi.mock` is hoisted
 * above the imports, so IntroExperience sees Mode B when its config import resolves.
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntroExperience } from "./IntroExperience";

vi.mock("./introAmbientAB.config", () => ({ INTRO_AMBIENT_AB: { mode: "B" } }));

const html = renderToStaticMarkup(createElement(IntroExperience, { text: "SAMORAH", onSkip: () => {} }));
const iAmbient = html.indexOf("lux-intro__ambient");
const iSpark = html.indexOf("lux-intro__spark");
const iFlame = html.indexOf('lux-intro__flame"'); // trailing quote → the flame span, not "...__flamewrap"

describe("Phase 3.2 — intro ambient layer order (Mode B)", () => {
  it("mounts the AmbientLight in Mode B", () => {
    expect(iAmbient).toBeGreaterThan(-1);
  });

  it("AmbientLight is behind both the Flame and the Spark (backmost overlay)", () => {
    expect(iAmbient).toBeLessThan(iSpark); // ambient < spark
    expect(iSpark).toBeLessThan(iFlame); // spark < flame (DOM order)
    expect(iAmbient).toBeLessThan(iFlame); // ambient < flame — the Phase 3.2 invariant
  });
});
