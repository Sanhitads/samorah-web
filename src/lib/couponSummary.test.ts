import { describe, it, expect } from "vitest";
import { describeCoupon, type CouponSummaryInput } from "@/lib/couponSummary";

const base: CouponSummaryInput = { code: "WELCOME10", type: "percent", value: 10 };

describe("describeCoupon — summary lines", () => {
  it("summarises a full campaign in readable order", () => {
    const { lines } = describeCoupon({
      ...base, value: 15, maxDiscount: 500, minOrder: 999, minQualifyingQuantity: 2,
      eligibility: "first_order", maxUsesPerUser: 1, maxUses: 100,
      startsAt: "2026-08-10T04:30:00Z", expiresAt: "2026-08-20T18:29:00Z",
      combinable: false, excludeSale: true,
      targets: [{ mode: "include", type: "category", label: "Candles" }],
    });
    expect(lines).toContain("15% off (up to ₹500)");
    expect(lines).toContain("Applies to Candles");
    expect(lines).toContain("Excludes sale items");
    expect(lines).toContain("Minimum order ₹999");
    expect(lines).toContain("Minimum 2 eligible items");
    expect(lines).toContain("First-order customers only");
    expect(lines).toContain("1 use per customer");
    expect(lines).toContain("100 total uses");
    expect(lines).toContain("Cannot combine with other promotions");
    expect(lines.find((l) => l.startsWith("Valid "))).toMatch(/IST$/);
  });
  it("fixed + free-shipping + entire-order phrasing", () => {
    expect(describeCoupon({ ...base, type: "fixed", value: 200 }).lines[0]).toBe("₹200 off");
    expect(describeCoupon({ ...base, type: "free_shipping", value: 0 }).lines[0]).toBe("Free shipping");
    expect(describeCoupon(base).lines).toContain("Applies to the entire order");
  });
});

describe("describeCoupon — warnings", () => {
  it("warns on no expiry", () => {
    expect(describeCoupon(base).warnings.some((w) => /No expiry/.test(w))).toBe(true);
  });
  it("warns when auto-apply is on", () => {
    expect(describeCoupon({ ...base, autoApply: true }).warnings.some((w) => /Auto-apply is on/.test(w))).toBe(true);
  });
  it("warns when usage limit is below current redemptions", () => {
    expect(describeCoupon({ ...base, maxUses: 5, usedCount: 9 }).warnings.some((w) => /below current redemptions/.test(w))).toBe(true);
  });
  it("warns when a target is both included and excluded", () => {
    const { warnings } = describeCoupon({
      ...base, expiresAt: "2027-01-01T00:00:00Z",
      targets: [{ mode: "include", type: "product", label: "Kashmiri Chai" }, { mode: "exclude", type: "product", label: "Kashmiri Chai" }],
    });
    expect(warnings.some((w) => /included and excluded/.test(w))).toBe(true);
  });
});
