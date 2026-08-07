// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement as h, type FC } from "react";

/**
 * V1 — ACTUAL RENDERED preview isolation. Renders the real shared path
 * BundlePageView → BundleBuilder → usePreviewBundleController and drives the full flow (select vessel,
 * add 3, remove, re-add, add-to-bag, unmount). Proves ZERO real side effects: the persisted
 * composition/cart stores and their localStorage are untouched, and no analytics / section beacon /
 * openCart fire. Only leaf presentational deps (framer-motion, AssetImage) are mocked — the preview
 * path itself runs for real through the injected-controller architecture (no second renderer).
 */
vi.mock("framer-motion", () => {
  const cache: Record<string, FC<{ className?: string; children?: React.ReactNode }>> = {};
  return {
    // Stable component identity per motion.<tag> so the grid is NOT remounted on every render.
    motion: new Proxy({}, { get: (_t, key: string) => (cache[key] ??= ({ className, children }) => h("div", { className }, children)) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => true,
  };
});
vi.mock("@/components/ui/AssetImage", () => ({ AssetImage: () => h("span", { className: "asset-mock" }) }));

import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { BundlePageView } from "@/components/bundle/BundlePageView";
import { usePreviewBundleController } from "@/store/bundleController";
import { DEFAULT_BUNDLE_CONFIG } from "@/lib/bundleConfig";
import type { BundleCandle } from "@/lib/bundle";
import { useCompositionStore } from "@/store/useCompositionStore";
import { useCartStore } from "@/store/useCartStore";
import { useUIStore } from "@/store/useUIStore";
import * as events from "@/lib/analytics/events";
import * as section from "@/lib/analytics/sectionTracking";

const candle = (id: string, name: string): BundleCandle => ({
  id, slug: id, name, tagline: `${name} tagline`, chapter: null, edition: "",
  image: { url: "gradient:x", alt: name },
  vessels: [{ vessel: "glass", variantId: `${id}-g`, size: "100g", price: 500, inStock: true }],
});
const CANDLES = [candle("a", "Alpha"), candle("b", "Bravo"), candle("c", "Charlie"), candle("d", "Delta")];

// A minimal preview wrapper (the Phase-2 seam) — injects the EPHEMERAL controller into the shared view.
const PreviewWrapper: FC = () =>
  h(BundlePageView, { config: DEFAULT_BUNDLE_CONFIG, candles: CANDLES, controller: usePreviewBundleController() });

describe("V1 — rendered preview isolation", () => {
  let openCartSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // Known baseline for the real stores.
    useCompositionStore.setState({ vessel: null, items: [], editingId: null });
    useCartStore.setState({ items: [] } as Partial<ReturnType<typeof useCartStore.getState>>);
    localStorage.clear();
    vi.spyOn(events, "trackBundleStarted");
    vi.spyOn(events, "trackBundleCompleted");
    vi.spyOn(events, "trackBundleAbandoned");
    vi.spyOn(events, "trackAddToCart");
    vi.spyOn(section, "trackSectionConversion");
    openCartSpy = vi.spyOn(useUIStore.getState(), "openCart");
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("drives the full preview flow with zero real side effects", () => {
    const { container, unmount } = render(h(PreviewWrapper));

    const click = (el: Element | null | undefined) => act(() => { if (el) fireEvent.click(el); });
    const cards = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".bundle-card"));

    const dotsOn = () => container.querySelectorAll(".composition__dot[data-on='true']").length;
    const addNext = () => click(cards().find((b) => b.getAttribute("data-chosen") === "false" && !b.disabled));

    // select Glass (first vessel card)
    click(container.querySelector(".vessel-card"));
    // add candle #1, #2, #3 (re-query each time so React re-renders don't stale the refs)
    addNext(); addNext(); addNext();
    expect(dotsOn()).toBe(3);
    expect(container.textContent).toContain("Composition Complete");
    // remove one, then re-add
    click(container.querySelector(".composition__remove"));
    expect(dotsOn()).toBe(2);
    addNext();
    expect(dotsOn()).toBe(3);
    // exercise Add-to-bag (inert in preview)
    click(container.querySelector(".composition__atc"));
    // unmount
    unmount();

    // ── real stores + persistence untouched ──
    expect(useCompositionStore.getState().items).toHaveLength(0);
    expect(useCompositionStore.getState().vessel).toBeNull();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(localStorage.getItem("samorah_composition")).toBeNull();
    expect(localStorage.getItem("samorah_cart")).toBeNull();
    // ── zero analytics / beacon / cart drawer ──
    expect(events.trackBundleStarted).not.toHaveBeenCalled();
    expect(events.trackBundleCompleted).not.toHaveBeenCalled();
    expect(events.trackBundleAbandoned).not.toHaveBeenCalled(); // including on unmount
    expect(events.trackAddToCart).not.toHaveBeenCalled();
    expect(section.trackSectionConversion).not.toHaveBeenCalled();
    expect(openCartSpy).not.toHaveBeenCalled();
  });
});
