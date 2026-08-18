/**
 * Phase 3.2 — explicit assertion of the intro ambient LAYER ORDER, so it is never left implicit.
 *
 * Intended order (front → back): Spark · Flame · AmbientLight · Background.
 * Invariant: the AmbientLight is the BACKMOST overlay — behind both the Flame and the Spark, in front of
 * the Background (ambient < spark < flame in DOM → the flame's transform stacking context keeps it on top).
 * The intro renders the ambient unconditionally (adopted), so no config mock is needed.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntroExperience } from "./IntroExperience";

const html = renderToStaticMarkup(createElement(IntroExperience, { text: "SAMORAH", onSkip: () => {} }));
const iAmbient = html.indexOf("lux-intro__ambient");
const iSpark = html.indexOf("lux-intro__spark");
const iFlame = html.indexOf('lux-intro__flame"'); // trailing quote → the flame span, not "...__flamewrap"

describe("Phase 3.2 — intro ambient layer order", () => {
  it("renders the AmbientLight", () => {
    expect(iAmbient).toBeGreaterThan(-1);
  });

  it("AmbientLight is behind both the Flame and the Spark (backmost overlay)", () => {
    expect(iAmbient).toBeLessThan(iSpark); // ambient < spark
    expect(iSpark).toBeLessThan(iFlame); // spark < flame (DOM order)
    expect(iAmbient).toBeLessThan(iFlame); // ambient < flame — the Phase 3.2 invariant
  });
});
