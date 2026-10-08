// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";

/**
 * HeroSlider — the two-hero slider. Proves: a SINGLE slide renders the bare hero with NO arrows
 * (un-edited homepage unchanged); two slides render ‹ › arrows and the track starts on slide 1;
 * clicking Next/Previous slides the track (translateX) and wraps around.
 */
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: (_t, tag: string) => ({ className, children }: { className?: string; children?: ReactNode }) => h(tag, { className }, children) }),
  useReducedMotion: () => true,
}));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children?: ReactNode }) => h("a", { href, className }, children) }));

import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { HeroSlider } from "@/components/home/HeroSlider";
import type { HeroCampaign } from "@/config/campaigns";

const slide = (id: string, heading: string): HeroCampaign => ({
  id, campaignName: id, heroImage: "gradient:grad-hero1", eyebrow: "E", heading, subheading: "S",
  ctaLabel: "Go", ctaHref: "/shop", theme: "warm-dark", isActive: true, startDate: null, endDate: null, displayOrder: 1,
});
const track = () => document.querySelector(".hero-slider__track") as HTMLElement;

afterEach(cleanup);

describe("HeroSlider", () => {
  it("single slide: renders the hero with NO slider arrows (unchanged behaviour)", () => {
    render(h(HeroSlider, { slides: [slide("a", "Only Hero")] }));
    expect(screen.getByText("Only Hero")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next hero" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous hero" })).toBeNull();
    expect(document.querySelector(".hero-slider")).toBeNull();
  });

  it("two slides: shows arrows, both heroes mounted, track starts at slide 1", () => {
    render(h(HeroSlider, { slides: [slide("a", "First Hero"), slide("b", "Second Hero")] }));
    expect(screen.getByRole("button", { name: "Next hero" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous hero" })).toBeTruthy();
    expect(screen.getByText("First Hero")).toBeTruthy();
    expect(screen.getByText("Second Hero")).toBeTruthy();
    expect(track().style.transform).toBe("translateX(-0%)");
  });

  it("Next slides to the second hero; Previous slides back", () => {
    render(h(HeroSlider, { slides: [slide("a", "First Hero"), slide("b", "Second Hero")] }));
    fireEvent.click(screen.getByRole("button", { name: "Next hero" }));
    expect(track().style.transform).toBe("translateX(-100%)");
    fireEvent.click(screen.getByRole("button", { name: "Previous hero" }));
    expect(track().style.transform).toBe("translateX(-0%)");
  });

  it("wraps around: Previous from slide 1 goes to the last slide", () => {
    render(h(HeroSlider, { slides: [slide("a", "First Hero"), slide("b", "Second Hero")] }));
    fireEvent.click(screen.getByRole("button", { name: "Previous hero" }));
    expect(track().style.transform).toBe("translateX(-100%)"); // wrapped to slide 2
  });
});
