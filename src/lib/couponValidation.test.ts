import { describe, it, expect } from "vitest";
import { validateCouponConfig, validateCouponDraft, validateCouponForActivation, normalizeCouponCode, type CouponConfigInput } from "@/lib/couponValidation";

const base: CouponConfigInput = { code: "WELCOME10", type: "percent", value: 10 };
const errs = (over: Partial<CouponConfigInput>) => validateCouponConfig({ ...base, ...over });

describe("normalizeCouponCode", () => {
  it("trims + uppercases so welcome10 and WELCOME10 are one code", () => {
    expect(normalizeCouponCode("  welcome10 ")).toBe("WELCOME10");
    expect(normalizeCouponCode(null)).toBe("");
  });
});

describe("validateCouponConfig", () => {
  it("accepts a well-formed percentage coupon", () => {
    expect(errs({})).toEqual([]);
    expect(errs({ maxDiscount: 300, minOrder: 999, maxUses: 100 })).toEqual([]);
  });
  it("accepts fixed and free_shipping", () => {
    expect(errs({ type: "fixed", value: 200 })).toEqual([]);
    expect(errs({ type: "free_shipping", value: 0 })).toEqual([]);
  });

  it("rejects an empty or malformed code", () => {
    expect(errs({ code: "" })).toContain("Code is required.");
    expect(errs({ code: "a" }).some((e) => /2–40/.test(e))).toBe(true);
    expect(errs({ code: "bad code!" }).some((e) => /letters, numbers/.test(e))).toBe(true);
  });

  it("rejects out-of-range percentages", () => {
    expect(errs({ value: 0 })).toContain("Percentage must be greater than 0.");
    expect(errs({ value: -5 })).toContain("Percentage must be greater than 0.");
    expect(errs({ value: 150 })).toContain("Percentage cannot exceed 100.");
  });
  it("rejects a non-positive fixed amount", () => {
    expect(errs({ type: "fixed", value: 0 })).toContain("Fixed amount must be greater than 0.");
  });

  it("rejects negatives and a cap on non-percentage coupons", () => {
    expect(errs({ maxDiscount: -1 })).toContain("Maximum discount cannot be negative.");
    expect(errs({ minOrder: -1 })).toContain("Minimum order cannot be negative.");
    expect(errs({ maxUses: -1 })).toContain("Maximum uses cannot be negative.");
    expect(errs({ maxUsesPerUser: -1 })).toContain("Per-customer limit cannot be negative.");
    expect(errs({ type: "fixed", value: 200, maxDiscount: 50 })).toContain("Maximum-discount cap applies only to percentage coupons.");
  });

  it("rejects expiry before/equal to start", () => {
    expect(errs({ startsAt: "2026-02-01", expiresAt: "2026-01-01" })).toContain("Expiry must be after the start date.");
    expect(errs({ startsAt: "2026-02-01", expiresAt: "2026-02-01" })).toContain("Expiry must be after the start date.");
    expect(errs({ startsAt: "2026-01-01", expiresAt: "2026-02-01" })).toEqual([]);
  });
  it("rejects invalid dates", () => {
    expect(errs({ startsAt: "not-a-date" })).toContain("Start date is invalid.");
  });

  it("rejects contradictory targeting (same target included AND excluded)", () => {
    const both = errs({
      includes: [{ type: "category", id: "cat-1" }],
      excludes: [{ type: "category", id: "cat-1" }],
    });
    expect(both).toContain("A target can't be both included and excluded.");
    // Different targets are fine.
    expect(errs({ includes: [{ type: "category", id: "cat-1" }], excludes: [{ type: "product", id: "p-9" }] })).toEqual([]);
  });
});

describe("draft vs activation validation (Phase 2 #7)", () => {
  it("DRAFT is lenient — incomplete config is saveable", () => {
    expect(validateCouponDraft({ code: "WIP", type: "percent", value: 0 })).toEqual([]);
    expect(validateCouponDraft({ code: "WIP", type: "fixed", value: 0 })).toEqual([]);
  });
  it("DRAFT still rejects impossible values + bad code", () => {
    expect(validateCouponDraft({ code: "X!", type: "percent", value: 10 }).length).toBeGreaterThan(0);
    expect(validateCouponDraft({ code: "P", type: "percent", value: 150 })).toContain("Percentage cannot exceed 100.");
    expect(validateCouponDraft({ code: "N", type: "percent", value: -5 })).toContain("Value cannot be negative.");
  });
  it("ACTIVATION is strict — the same incomplete config is rejected", () => {
    expect(validateCouponForActivation({ code: "WIP", type: "percent", value: 0 }).length).toBeGreaterThan(0);
    expect(validateCouponForActivation({ code: "D", type: "percent", value: 10, startsAt: "2026-02-01", expiresAt: "2026-01-01" })).toContain("Expiry must be after the start date.");
    expect(validateCouponForActivation({ code: "GOOD", type: "percent", value: 10, minOrder: 999 })).toEqual([]);
  });
});
