// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement as h } from "react";

/**
 * ComposedSections hero wiring — the slider only appears when a VISIBLE secondary hero exists:
 *   • hero only                     → single <Hero>, no slider (unchanged homepage)
 *   • hero + visible secondary      → <HeroSlider> with 2 slides; secondary renders nothing standalone
 *   • hero + hidden secondary       → single <Hero> (no slider)
 *   • secondary only (no hero)      → a standalone <Hero>
 * Hero/HeroSlider are stubbed so we can assert which one was chosen.
 */
vi.mock("@/components/home/Hero", () => ({ Hero: ({ campaign }: { campaign: { heading?: string } }) => h("div", { "data-testid": "hero", "data-heading": campaign.heading ?? "" }) }));
vi.mock("@/components/home/HeroSlider", () => ({ HeroSlider: ({ slides }: { slides: { heading?: string }[] }) => h("div", { "data-testid": "slider", "data-count": String(slides.length) }, slides.map((s) => s.heading).join("|")) }));

import { render, cleanup, screen } from "@testing-library/react";
import { ComposedSections } from "@/components/page/ComposedSections";
import type { ComposedSection } from "@/services/pageComposerService";

const sec = (type: string, settings: Record<string, unknown> = {}, over: Partial<ComposedSection> = {}): ComposedSection =>
  ({ id: type, type, enabled: true, sortOrder: 0, settings, ...over });

afterEach(cleanup);

describe("ComposedSections — hero slider wiring", () => {
  it("hero only → single Hero, no slider", () => {
    render(h(ComposedSections, { sections: [sec("hero", { heading: "Main" })] }));
    expect(screen.getByTestId("hero")).toBeTruthy();
    expect(screen.queryByTestId("slider")).toBeNull();
  });

  it("hero + visible secondary → slider with 2 slides, no standalone hero", () => {
    render(h(ComposedSections, { sections: [sec("hero", { heading: "Main" }), sec("secondary-hero", { heading: "Second" })] }));
    const slider = screen.getByTestId("slider");
    expect(slider.getAttribute("data-count")).toBe("2");
    expect(slider.textContent).toBe("Main|Second");
    expect(screen.queryByTestId("hero")).toBeNull(); // consumed into the slider
  });

  it("hero + hidden secondary (visible:false) → single Hero, no slider", () => {
    render(h(ComposedSections, { sections: [sec("hero", { heading: "Main" }), sec("secondary-hero", { heading: "Second", visible: false })] }));
    expect(screen.getByTestId("hero").getAttribute("data-heading")).toBe("Main");
    expect(screen.queryByTestId("slider")).toBeNull();
  });

  it("secondary only (no hero) → a standalone Hero", () => {
    render(h(ComposedSections, { sections: [sec("secondary-hero", { heading: "Second" })] }));
    expect(screen.getByTestId("hero").getAttribute("data-heading")).toBe("Second");
    expect(screen.queryByTestId("slider")).toBeNull();
  });

  it("disabled secondary is ignored → single Hero", () => {
    render(h(ComposedSections, { sections: [sec("hero", { heading: "Main" }), sec("secondary-hero", { heading: "Second" }, { enabled: false })] }));
    expect(screen.getByTestId("hero")).toBeTruthy();
    expect(screen.queryByTestId("slider")).toBeNull();
  });
});
