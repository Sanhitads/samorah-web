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
