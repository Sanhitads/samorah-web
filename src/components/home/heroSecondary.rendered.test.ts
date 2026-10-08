// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";

/**
 * Homepage Hero rendering — optional Secondary line + Secondary CTA. Proves both appear when set
 * (with the right href/label), that the secondary CTA needs BOTH label and href, and that an
 * un-edited hero (no secondary fields) renders exactly as before: primary CTA only, no notes line.
 */
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: (_t, tag: string) => ({ className, children }: { className?: string; children?: ReactNode }) => h(tag, { className }, children) }),
  useReducedMotion: () => true,
}));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children?: ReactNode }) => h("a", { href, className }, children) }));

import { render, cleanup, screen } from "@testing-library/react";
import { Hero } from "@/components/home/Hero";
import type { HeroCampaign } from "@/config/campaigns";

const base: HeroCampaign = {
  id: "t", campaignName: "T", heroImage: "gradient:grad-hero1",
  eyebrow: "Handcrafted", heading: "Fragrance as Atmosphere", subheading: "Slow-crafted luxury candles.",
  ctaLabel: "Explore Chapters", ctaHref: "/shop", theme: "warm-dark",
  isActive: true, startDate: null, endDate: null, displayOrder: 1,
};
const renderHero = (over: Partial<HeroCampaign>) => render(h(Hero, { campaign: { ...base, ...over } }));

afterEach(cleanup);

describe("Hero — secondary line + secondary CTA", () => {
  it("renders the secondary line and the secondary CTA with its href when both are set", () => {
    renderHero({
      secondaryLine: "Green Tea · Cardamom · Rose · Sweet Milk · Sandalwood",
      secondaryCtaLabel: "Explore the Chapter", secondaryCtaHref: "/chapters/dessert-chapter",
    });
    expect(screen.getByText("Green Tea · Cardamom · Rose · Sweet Milk · Sandalwood")).toBeTruthy();
    const secondary = screen.getByRole("link", { name: "Explore the Chapter" }) as HTMLAnchorElement;
    expect(secondary.getAttribute("href")).toBe("/chapters/dessert-chapter");
    expect(secondary.className).toContain("home-hero__cta--secondary");
    // Primary CTA still present — both buttons coexist.
    expect(screen.getByRole("link", { name: "Explore Chapters" })).toBeTruthy();
  });

  it("un-edited hero: no secondary line, and only the primary CTA (unchanged behaviour)", () => {
    renderHero({});
    expect(screen.queryByText(/Green Tea/)).toBeNull();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe("Explore Chapters");
  });

  it("secondary CTA requires BOTH label and href (label only → not rendered)", () => {
    renderHero({ secondaryCtaLabel: "Explore the Chapter" }); // no href
    expect(screen.queryByText("Explore the Chapter")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1); // only the primary
  });

  it("can show a secondary line even when no secondary CTA is set", () => {
    renderHero({ secondaryLine: "Green Tea · Cardamom" });
    expect(screen.getByText("Green Tea · Cardamom")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(1); // primary only
  });
});
