import { describe, it, expect } from "vitest";
import { airEditionLabel, airEditionOf, type AirVolume } from "@/config/theHours";

// Minimal volume: two hours in one group. airEditionOf numbers by config index (1-based).
const vol = {
  volume: "Volume I",
  groups: [{ hours: [{ productSlug: "open-window" }, { productSlug: "slow-evening" }] }],
} as unknown as AirVolume;

describe("airEditionLabel — the admin's chapter position drives the VOL. I.n number", () => {
  it("uses the last segment of chapter_position when set (\"1.4\" → VOL. I.4)", () => {
    expect(airEditionLabel(vol, "1.4", "slow-evening")).toBe("VOL. I.4");
    expect(airEditionLabel(vol, "3", "slow-evening")).toBe("VOL. I.3");
  });

  it("falls back to the config position when chapter_position is blank/undefined", () => {
    expect(airEditionLabel(vol, undefined, "slow-evening")).toBe(airEditionOf(vol, "slow-evening")); // "VOL. I.2"
    expect(airEditionLabel(vol, "", "open-window")).toBe(airEditionOf(vol, "open-window")); // "VOL. I.1"
  });
});

import { candleChaptersOnly, isAirCollectionSlug, AIR_COLLECTION_SLUGS } from "@/config/theHours";

describe("candleChaptersOnly — air 'The Hours' collections are excluded from the candle rail", () => {
  it("both air collections (live the-everyday + coming-soon the-intimate) are air; candle chapters are not", () => {
    expect(AIR_COLLECTION_SLUGS.has("the-everyday")).toBe(true);
    expect(isAirCollectionSlug("the-everyday")).toBe(true);
    // the-intimate (Volume II) is still coming soon but must be covered so it can never leak once launched.
    expect(isAirCollectionSlug("the-intimate")).toBe(true);
    expect(isAirCollectionSlug("dessert-chapter")).toBe(false);
    expect(isAirCollectionSlug("mood-library")).toBe(false);
    expect(isAirCollectionSlug(null)).toBe(false);
    expect(isAirCollectionSlug(undefined)).toBe(false);
  });

  it("filters out air chapters, keeps candle chapters, preserves order", () => {
    const all = [
      { slug: "dessert-chapter", name: "Dessert Chapter" },
      { slug: "the-wild-within", name: "The Wild Within" },
      { slug: "the-everyday", name: "The Everyday" }, // air — must be dropped
      { slug: "mood-library", name: "Mood Library" },
      { slug: "the-intimate", name: "The Intimate" }, // air — must be dropped even if ever made live
    ];
    const candle = candleChaptersOnly(all);
    expect(candle.map((c) => c.slug)).toEqual(["dessert-chapter", "the-wild-within", "mood-library"]);
    expect(candle.find((c) => c.slug === "the-everyday")).toBeUndefined();
    expect(candle.find((c) => c.slug === "the-intimate")).toBeUndefined();
  });

  it("no air chapters present → returns the list unchanged", () => {
    const all = [{ slug: "dessert-chapter" }, { slug: "nature-chapter" }];
    expect(candleChaptersOnly(all).map((c) => c.slug)).toEqual(["dessert-chapter", "nature-chapter"]);
  });
});
