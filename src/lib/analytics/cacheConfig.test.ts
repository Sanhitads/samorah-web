import { describe, it, expect, afterEach } from "vitest";
import { cacheMs, cacheSeconds } from "@/lib/analytics/cacheConfig";

/** R1B — the `reports` cache key exists, defaults sensibly, and honours the env override like every source. */
afterEach(() => {
  delete process.env.ANALYTICS_CACHE_REPORTS_MS;
});

describe("cacheConfig — reports key (R1B)", () => {
  it("has a sane default (5 min) and derives whole seconds", () => {
    expect(cacheMs("reports")).toBe(300_000);
    expect(cacheSeconds("reports")).toBe(300);
  });

  it("honours the ANALYTICS_CACHE_REPORTS_MS env override", () => {
    process.env.ANALYTICS_CACHE_REPORTS_MS = "60000";
    expect(cacheMs("reports")).toBe(60_000);
    expect(cacheSeconds("reports")).toBe(60);
  });

  it("ignores an invalid override and falls back to the default", () => {
    process.env.ANALYTICS_CACHE_REPORTS_MS = "not-a-number";
    expect(cacheMs("reports")).toBe(300_000);
  });

  it("cacheSeconds never rounds below 1", () => {
    process.env.ANALYTICS_CACHE_REPORTS_MS = "100";
    expect(cacheSeconds("reports")).toBe(1);
  });
});
