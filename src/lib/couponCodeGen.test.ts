import { describe, it, expect } from "vitest";
import { generateCouponCode, normalizePrefix } from "./couponCodeGen";

// Deterministic RNG cycling through fixed values.
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe("generateCouponCode", () => {
  it("prefix + unambiguous suffix, uppercased", () => {
    expect(generateCouponCode("welcome", { rng: seq([0, 0, 0, 0, 0]) })).toBe("WELCOME-AAAAA");
  });
  it("no prefix ⇒ suffix only", () => {
    expect(generateCouponCode("", { rng: seq([0]) })).toBe("AAAAA");
    expect(generateCouponCode(null, { rng: seq([0]) })).toBe("AAAAA");
  });
  it("suffix uses only the unambiguous charset (no O/0/I/1/L)", () => {
    const code = generateCouponCode("X", { length: 12, rng: Math.random }).split("-")[1];
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
    expect(code).not.toMatch(/[O0I1L]/);
  });
  it("respects length within bounds", () => {
    expect(generateCouponCode("P", { length: 3, rng: seq([0]) })).toBe("P-AAA");
    expect(generateCouponCode("P", { length: 99, rng: seq([0]) }).split("-")[1].length).toBe(12); // clamped
  });
  it("normalizePrefix strips punctuation/spaces and uppercases", () => {
    expect(normalizePrefix("  pri-ya! ")).toBe("PRIYA");
    expect(normalizePrefix("diwali 2026")).toBe("DIWALI2026");
  });
});
