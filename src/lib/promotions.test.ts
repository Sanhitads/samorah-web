import { describe, it, expect, afterEach } from "vitest";
import { computePromotions, COUPONS, type PromoLine, type Coupon } from "@/lib/promotions";

const comp = (key: string, price: number): PromoLine => ({ key, unitPrice: price, qty: 1, compositionId: "c1" });

afterEach(() => {
  COUPONS.length = 0; // reset registry between tests
});

describe("promotion engine — stacking rules + snapshots", () => {
  it("Discovery Composition is one rule, allocated per line, with a snapshot", () => {
    const r = computePromotions([comp("a", 580), comp("b", 580), comp("c", 580)]);
    expect(r.discount).toBe(26100); // (580−493)*3 in paise
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0].code).toBe("DISCOVERY_COMPOSITION");
    expect(r.applied[0].campaign).toBe("evergreen");
    expect(r.byLine.a).toBe(8700); // ₹87 per line
  });

  it("stacking — Composition + Free Shipping stack (combinableWith)", () => {
    const free: Coupon = {
      code: "FREESHIP", label: "Free Shipping", campaign: "freeship", version: "v1",
      priority: 30, stackable: true, exclusive: false, combinableWith: ["*"],
      type: "free_shipping", value: 0, active: true,
    };
    COUPONS.push(free);
    const r = computePromotions([comp("a", 580), comp("b", 580), comp("c", 580)], "FREESHIP");
    expect(r.freeShipping).toBe(true);
    expect(r.applied.map((p) => p.code)).toEqual(["DISCOVERY_COMPOSITION", "FREESHIP"]);
    expect(r.skipped).toHaveLength(0);
  });

  it("stacking — Composition + WELCOME10 do NOT stack (skipped, logged)", () => {
    const welcome: Coupon = {
      code: "WELCOME10", label: "Welcome (10%)", campaign: "welcome", version: "v1",
      priority: 20, stackable: true, exclusive: false, combinableWith: ["FREE_SHIPPING"],
      type: "percentage", value: 10, active: true,
    };
    COUPONS.push(welcome);
    const r = computePromotions([comp("a", 580), comp("b", 580), comp("c", 580)], "WELCOME10");
    // composition (priority 10) applies; welcome (20) can't combine → skipped
    expect(r.applied.map((p) => p.code)).toEqual(["DISCOVERY_COMPOSITION"]);
    expect(r.skipped[0]).toMatchObject({ code: "WELCOME10" });
  });

  it("PROMO-005 — an inactive/expired coupon is rejected", () => {
    COUPONS.push({
      code: "OLDSALE", label: "Old", campaign: "x", version: "v1", priority: 20,
      stackable: true, exclusive: false, combinableWith: ["*"], type: "percentage", value: 10, active: false,
    });
    const r = computePromotions([comp("a", 580), comp("b", 580), comp("c", 580)], "OLDSALE");
    expect(r.applied.map((p) => p.code)).toEqual(["DISCOVERY_COMPOSITION"]); // coupon ignored
  });

  it("PROMO-006 — an unknown coupon code applies nothing extra", () => {
    const r = computePromotions([comp("a", 580), comp("b", 580), comp("c", 580)], "DOESNOTEXIST");
    expect(r.applied.map((p) => p.code)).toEqual(["DISCOVERY_COMPOSITION"]);
  });

  it("determinism — lower priority applies first", () => {
    const early: Coupon = {
      code: "EARLY", label: "Early", campaign: "x", version: "v1",
      priority: 1, stackable: true, exclusive: false, combinableWith: ["*"],
      type: "percentage", value: 5, active: true,
    };
    COUPONS.push(early);
    // Coupons never discount bundle/composition lines (Phase-1 policy), so the cart also holds a
    // standalone line "d" the coupon CAN apply to. EARLY (priority 1) applies first; composition
    // (priority 10) then can't combine with a non-listed code → skipped. Order is deterministic.
    const solo = (key: string, price: number): PromoLine => ({ key, unitPrice: price, qty: 1 });
    const r = computePromotions([comp("a", 580), comp("b", 580), comp("c", 580), solo("d", 1000)], "EARLY");
    expect(r.applied[0].code).toBe("EARLY");
    expect(r.skipped.map((s) => s.code)).toContain("DISCOVERY_COMPOSITION");
  });
});
