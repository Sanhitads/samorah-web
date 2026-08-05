import { describe, it, expect } from "vitest";
import { findOverrideDuplicates } from "./duplicateMeta";

describe("findOverrideDuplicates (P2-11 — explicit-override only)", () => {
  it("detects duplicate titles + descriptions across override rows (case-insensitive)", () => {
    const dups = findOverrideDuplicates([
      { path: "/a", title: "Shop Candles", description: "Buy now" },
      { path: "/b", title: "shop candles", description: "Different" },
      { path: "/c", title: "Unique", description: "Buy now" },
    ]);
    const title = dups.find((d) => d.field === "title")!;
    expect(title.paths.sort()).toEqual(["/a", "/b"]);
    const desc = dups.find((d) => d.field === "description")!;
    expect(desc.paths.sort()).toEqual(["/a", "/c"]);
  });
  it("ignores blank values and unique values", () => {
    expect(findOverrideDuplicates([
      { path: "/a", title: "X", description: "" },
      { path: "/b", title: "", description: "" },
      { path: "/c", title: "Y", description: "" },
    ])).toEqual([]);
  });
});
