import { describe, it, expect } from "vitest";
import { extractTokens, interpolate, interpolateTracked, suggestToken } from "./tokens";

describe("extractTokens", () => {
  it("finds and dedupes {{tokens}}, ignoring whitespace variants", () => {
    expect(extractTokens("Hi {{name}}, order {{orderNumber}} — {{ name }}")).toEqual(["name", "orderNumber"]);
  });
  it("returns [] for no tokens / nullish", () => {
    expect(extractTokens("plain text")).toEqual([]);
    // @ts-expect-error nullish tolerance
    expect(extractTokens(undefined)).toEqual([]);
  });
});

describe("interpolate / interpolateTracked", () => {
  it("substitutes known tokens", () => {
    expect(interpolate("Hi {{name}}", { name: "Aarohi" })).toBe("Hi Aarohi");
  });
  it("BLANKS unknown tokens — a raw {{token}} can never leak to a customer", () => {
    expect(interpolate("Hi {{nmae}}!", { name: "Aarohi" })).toBe("Hi !");
  });
  it("substitutes an empty-string value without treating it as unknown", () => {
    const r = interpolateTracked("Total {{total}}", { total: "" });
    expect(r.text).toBe("Total ");
    expect(r.unknown).toEqual([]);
  });
  it("reports the set of unresolved tokens (deduped)", () => {
    const r = interpolateTracked("{{a}} {{b}} {{a}}", { a: "x" });
    expect(r.text).toBe("x  x");
    expect(r.unknown).toEqual(["b"]);
  });
});

describe("suggestToken", () => {
  it("suggests the nearest allowed token for a typo", () => {
    expect(suggestToken("ordreNumber", ["orderNumber", "name"])).toBe("orderNumber");
    expect(suggestToken("nmae", ["orderNumber", "name"])).toBe("name");
  });
  it("returns null when nothing is close", () => {
    expect(suggestToken("zzzzzzzz", ["orderNumber", "name"])).toBeNull();
  });
});
