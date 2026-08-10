import { describe, it, expect } from "vitest";
import { compareKpi, trendArrow } from "@/lib/analytics/kpi";

describe("compareKpi (Stage 1 foundation)", () => {
  it("rise with higherIsBetter → up + good", () => {
    const c = compareKpi(120, 100);
    expect(c).toMatchObject({ absolute: 20, pct: 20, direction: "up", tone: "good" });
  });
  it("fall with higherIsBetter → down + bad", () => {
    const c = compareKpi(80, 100);
    expect(c).toMatchObject({ absolute: -20, pct: -20, direction: "down", tone: "bad" });
  });
  it("no change → flat + neutral, pct 0", () => {
    expect(compareKpi(100, 100)).toMatchObject({ absolute: 0, pct: 0, direction: "flat", tone: "neutral" });
  });
  it("rise when lower-is-better (returns) → up + bad", () => {
    expect(compareKpi(12, 10, false)).toMatchObject({ direction: "up", tone: "bad" });
  });
  it("fall when lower-is-better → down + good", () => {
    expect(compareKpi(8, 10, false)).toMatchObject({ direction: "down", tone: "good" });
  });
  it("null previous → neutral, no absolute/pct", () => {
    expect(compareKpi(50, null)).toMatchObject({ previous: null, absolute: null, pct: null, direction: "flat", tone: "neutral" });
  });
  it("previous zero → pct null (no divide-by-zero) but absolute present", () => {
    const c = compareKpi(30, 0);
    expect(c.absolute).toBe(30);
    expect(c.pct).toBeNull();
    expect(c.direction).toBe("up");
  });
  it("rounds pct to one decimal", () => {
    expect(compareKpi(101, 300).pct).toBe(-66.3);
  });
  it("trendArrow glyphs", () => {
    expect(trendArrow("up")).toBe("▲");
    expect(trendArrow("down")).toBe("▼");
    expect(trendArrow("flat")).toBe("—");
  });
});
