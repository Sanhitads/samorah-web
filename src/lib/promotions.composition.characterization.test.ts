import { describe, it, expect } from "vitest";
import { computePromotions } from "@/lib/promotions";
import { BUNDLE_DISCOUNT_PCT } from "@/lib/bundle";

/**
 * CHARACTERIZATION — pins the EXACT current composition-promotion output so the Phase-0 discount
 * canonicalization (deriving the "15" label/rule.value from BUNDLE_DISCOUNT_PCT) is provably a
 * no-op: label string, rule.value, per-line and total amounts, and snapshot shape must be identical
 * before and after. This test passes on the pre-change code and MUST keep passing after.
 */
describe("composition promotion — characterization (must not change)", () => {
  const lines = [
    { key: "a", unitPrice: 500, qty: 1, compositionId: "comp-1" },
    { key: "b", unitPrice: 500, qty: 1, compositionId: "comp-1" },
    { key: "c", unitPrice: 500, qty: 1, compositionId: "comp-1" },
  ];

  it("applies exactly 15% per complete set with the frozen snapshot shape", () => {
    const r = computePromotions(lines);
    // per-line: (50000 - round(50000*0.85)) = 50000 - 42500 = 7500 paise each
    expect(r.byLine).toEqual({ a: 7500, b: 7500, c: 7500 });
    expect(r.discount).toBe(22500);
    expect(r.freeShipping).toBe(false);
    expect(r.applied).toHaveLength(1);
    const snap = r.applied[0];
    expect(snap.code).toBe("DISCOVERY_COMPOSITION");
    expect(snap.label).toBe("Discovery Composition Savings (15%)"); // literal today; derived after, same value
    expect(snap.campaign).toBe("evergreen");
    expect(snap.version).toBe("v1");
    expect(snap.rule).toEqual({ kind: "composition", value: 15 });
    expect(snap.amount).toBe(22500);
    // V6 — the persisted promotion rule percentage is the canonical BUNDLE_DISCOUNT_PCT (no drift).
    expect(snap.rule.value).toBe(BUNDLE_DISCOUNT_PCT);
    expect(snap.label).toBe(`Discovery Composition Savings (${BUNDLE_DISCOUNT_PCT}%)`);
  });

  it("does NOT apply to an incomplete set (fewer than 3 lines share the id)", () => {
    const r = computePromotions(lines.slice(0, 2));
    expect(r.discount).toBe(0);
    expect(r.applied).toHaveLength(0);
  });
});
