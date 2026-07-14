import { describe, it, expect } from "vitest";
import { normalizePrefs, defaultPrefs, PREFS_SCHEMA_VERSION } from "./prefs";

describe("normalizePrefs — forward-compatible upgrade", () => {
  it("returns defaults for null/garbage input", () => {
    expect(normalizePrefs(null)).toEqual(defaultPrefs());
    expect(normalizePrefs("nope")).toEqual(defaultPrefs());
    expect(normalizePrefs(42)).toEqual(defaultPrefs());
  });

  it("always stamps the current schema version", () => {
    expect(normalizePrefs({ schema_version: 0 }).schema_version).toBe(PREFS_SCHEMA_VERSION);
  });

  it("merges partial payloads onto defaults without dropping unspecified keys", () => {
    const out = normalizePrefs({ theme: "dark", notifications: { priceDrops: true } });
    expect(out.theme).toBe("dark");
    expect(out.notifications).toEqual({ orderUpdates: true, backInStock: false, priceDrops: true });
    expect(out.marketing).toEqual({ email: false, sms: false }); // untouched defaults preserved
  });

  it("rejects an invalid theme, falling back to the default", () => {
    expect(normalizePrefs({ theme: "neon" }).theme).toBe("system");
  });

  it("filters non-string entries and caps recentlyViewed at 40", () => {
    const raw = { recentlyViewed: [...Array(50).keys()].map((i) => `slug-${i}`).concat([1 as unknown as string, null as unknown as string]) };
    const out = normalizePrefs(raw);
    expect(out.recentlyViewed).toHaveLength(40);
    expect(out.recentlyViewed.every((s) => typeof s === "string")).toBe(true);
  });

  it("keeps a well-formed quizState object but nulls a non-object", () => {
    expect(normalizePrefs({ quizState: { step: 2 } }).quizState).toEqual({ step: 2 });
    expect(normalizePrefs({ quizState: "x" }).quizState).toBeNull();
  });
});
