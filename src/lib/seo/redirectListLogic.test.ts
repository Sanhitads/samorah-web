import { describe, it, expect } from "vitest";
import { classifyRedirectHealth } from "./redirectHealth";
import { filterSortRedirects, type RedirectListItem } from "./redirectFilter";

describe("classifyRedirectHealth (point 20 — deterministic, no traffic)", () => {
  const sources = new Map<string, string>([["/mid", "/final"]]);
  it("disabled → disabled", () => {
    expect(classifyRedirectHealth({ enabled: false, fromPath: "/a", toPath: "/b" }, sources, false).health).toBe("disabled");
  });
  it("broken destination → broken", () => {
    expect(classifyRedirectHealth({ enabled: true, fromPath: "/a", toPath: "/gone" }, sources, true).health).toBe("broken");
  });
  it("destination that itself redirects → chain", () => {
    const r = classifyRedirectHealth({ enabled: true, fromPath: "/old", toPath: "/mid" }, sources, false);
    expect(r.health).toBe("chain");
    expect(r.detail).toContain("/final");
  });
  it("otherwise → healthy", () => {
    expect(classifyRedirectHealth({ enabled: true, fromPath: "/a", toPath: "/live" }, sources, false).health).toBe("healthy");
  });
});

describe("filterSortRedirects (point 18 — stored-data only, no traffic sorts)", () => {
  const rows: RedirectListItem[] = [
    { id: "1", fromPath: "/b-old", toPath: "/b", code: 301, enabled: true, createdAt: "2026-01-01", health: "healthy" },
    { id: "2", fromPath: "/a-old", toPath: "/mid", code: 302, enabled: false, createdAt: "2026-03-01", health: "disabled" },
    { id: "3", fromPath: "/c-old", toPath: "/gone", code: 301, enabled: true, createdAt: "2026-02-01", health: "broken" },
  ];
  it("searches source + destination", () => {
    expect(filterSortRedirects(rows, { query: "mid" }).map((r) => r.id)).toEqual(["2"]);
  });
  it("filters by status/type/problems", () => {
    expect(filterSortRedirects(rows, { filter: "active" }).map((r) => r.id).sort()).toEqual(["1", "3"]);
    expect(filterSortRedirects(rows, { filter: "disabled" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterSortRedirects(rows, { filter: "temporary" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterSortRedirects(rows, { filter: "problems" }).map((r) => r.id)).toEqual(["3"]);
  });
  it("sorts by recently created (default) and alphabetical", () => {
    expect(filterSortRedirects(rows, { sort: "created" }).map((r) => r.id)).toEqual(["2", "3", "1"]);
    expect(filterSortRedirects(rows, { sort: "alpha" }).map((r) => r.fromPath)).toEqual(["/a-old", "/b-old", "/c-old"]);
  });
});
