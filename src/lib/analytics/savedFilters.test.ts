// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readSavedWindow, saveWindow, localFilterStore, DEFAULT_FILTER, SAVED_FILTER_VERSION, type SavedFilterStore } from "@/lib/analytics/savedFilters";

beforeEach(() => window.localStorage.clear());

describe("savedFilters (Stage 3 saved-filter architecture)", () => {
  it("round-trips the window via the localStorage store", () => {
    expect(readSavedWindow()).toBeNull();
    saveWindow("90");
    expect(readSavedWindow()).toBe("90");
  });

  it("ignores malformed stored JSON", () => {
    window.localStorage.setItem("samorah.analytics.filters.v1", "{not json");
    expect(readSavedWindow()).toBeNull();
    window.localStorage.setItem("samorah.analytics.filters.v1", JSON.stringify({ window: 123 }));
    expect(readSavedWindow()).toBeNull(); // window must be a string
  });

  it("DEFAULT_FILTER is 30 days at the current version", () => {
    expect(DEFAULT_FILTER.window).toBe("30");
    expect(DEFAULT_FILTER.version).toBe(SAVED_FILTER_VERSION);
  });

  it("persists the version and drops preferences from an incompatible version", () => {
    saveWindow("7");
    expect(JSON.parse(window.localStorage.getItem("samorah.analytics.filters.v1")!).version).toBe(SAVED_FILTER_VERSION);
    // simulate a future schema version → must be ignored, not mis-read
    window.localStorage.setItem("samorah.analytics.filters.v1", JSON.stringify({ version: 999, window: "90" }));
    expect(readSavedWindow()).toBeNull();
  });

  it("works against any SavedFilterStore implementation (the DB seam)", () => {
    let mem: string | null = null;
    const store: SavedFilterStore = {
      read: () => (mem ? JSON.parse(mem) : null),
      write: (s) => { mem = JSON.stringify(s); },
    };
    saveWindow("7", store);
    expect(readSavedWindow(store)).toBe("7");
    // localStorage store untouched
    expect(readSavedWindow(localFilterStore)).toBeNull();
  });
});
