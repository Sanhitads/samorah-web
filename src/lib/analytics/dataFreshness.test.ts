import { describe, it, expect } from "vitest";
import { makeFreshness, cacheAgeLabel } from "@/lib/analytics/dataFreshness";

describe("dataFreshness", () => {
  const now = 1_000_000_000_000;
  it("available + fresh → healthy", () => {
    const f = makeFreshness("ga4", { fetchedAtMs: now - 30_000, ttlMs: 120_000, available: true, nowMs: now });
    expect(f.status).toBe("healthy");
    expect(f.available).toBe(true);
  });
  it("available + past ttl → stale", () => {
    const f = makeFreshness("clarity", { fetchedAtMs: now - 10 * 3600_000, ttlMs: 6 * 3600_000, available: true, nowMs: now });
    expect(f.status).toBe("stale");
  });
  it("unavailable → unavailable regardless of age", () => {
    const f = makeFreshness("ga4", { fetchedAtMs: null, ttlMs: 120_000, available: false, nowMs: now });
    expect(f.status).toBe("unavailable");
  });

  it("cacheAgeLabel buckets", () => {
    expect(cacheAgeLabel(null)).toBe("—");
    expect(cacheAgeLabel(now - 10_000, now)).toBe("just now");
    expect(cacheAgeLabel(now - 5 * 60_000, now)).toBe("5m ago");
    expect(cacheAgeLabel(now - 3 * 3600_000, now)).toBe("3h ago");
    expect(cacheAgeLabel(now - 2 * 86_400_000, now)).toBe("2d ago");
  });
});
