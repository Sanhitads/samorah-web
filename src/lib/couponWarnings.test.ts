import { describe, it, expect } from "vitest";
import { buildCouponWarnings, topSeverity, EXPIRY_WARNING_MS, type WarningFacts } from "./couponWarnings";

const NOW = Date.parse("2026-08-04T00:00:00Z");
function facts(over: Partial<WarningFacts> = {}): WarningFacts {
  return {
    effectiveStatus: "active",
    autoApply: false,
    expiresAt: null,
    usedCount: 0,
    maxUses: null,
    invalidReason: null,
    eligibleProductCount: 5,
    archivedTargetLabels: [],
    conflictsWith: [],
    hasIncludes: true,
    nowMs: NOW,
    ...over,
  };
}
const codes = (f: WarningFacts) => buildCouponWarnings(f).map((w) => w.code);

describe("buildCouponWarnings — severity + noise rules", () => {
  it("expired/exhausted/archived/paused/draft raise NO warnings (badge covers them)", () => {
    for (const s of ["expired", "exhausted", "archived", "paused", "draft"]) {
      expect(buildCouponWarnings(facts({ effectiveStatus: s, eligibleProductCount: 0, expiresAt: "2026-08-04T06:00:00Z" }))).toEqual([]);
    }
  });

  it("CRITICAL: active coupon targeting no eligible products", () => {
    const w = buildCouponWarnings(facts({ eligibleProductCount: 0 }));
    expect(w[0]).toMatchObject({ severity: "critical", code: "no_eligible_products" });
  });

  it("CRITICAL: invalid config + auto-apply conflict (live only)", () => {
    const w = buildCouponWarnings(facts({ invalidReason: "Percentage must be > 0", autoApply: true, conflictsWith: ["DIWALI20"] }));
    expect(w.some((x) => x.code === "invalid_config" && x.severity === "critical")).toBe(true);
    expect(w.some((x) => x.code === "auto_conflict" && x.severity === "critical")).toBe(true);
  });

  it("scheduled coupon downgrades catalog issues to WARNING (fix before launch)", () => {
    const w = buildCouponWarnings(facts({ effectiveStatus: "scheduled", eligibleProductCount: 0 }));
    expect(w.find((x) => x.code === "no_eligible_products")?.severity).toBe("warning");
  });

  it("WARNING: ≥90% capacity used (uses used_count incl. reservations), not at 100%", () => {
    expect(codes(facts({ maxUses: 100, usedCount: 92 }))).toContain("near_limit");
    expect(codes(facts({ maxUses: 100, usedCount: 100 }))).not.toContain("near_limit"); // exhausted → badge
    expect(codes(facts({ maxUses: 100, usedCount: 50 }))).not.toContain("near_limit");
  });

  it("WARNING: expiring within the centralized threshold; not beyond it", () => {
    expect(codes(facts({ expiresAt: new Date(NOW + EXPIRY_WARNING_MS - 1000).toISOString() }))).toContain("expiring_soon");
    expect(codes(facts({ expiresAt: new Date(NOW + EXPIRY_WARNING_MS + 3600_000).toISOString() }))).not.toContain("expiring_soon");
  });

  it("WARNING: archived target", () => {
    expect(codes(facts({ archivedTargetLabels: ["candle"] }))).toContain("archived_target");
  });

  it("INFO: no expiry + broad targeting (live)", () => {
    const w = codes(facts({ expiresAt: null, hasIncludes: false }));
    expect(w).toContain("no_expiry");
    expect(w).toContain("broad_targeting");
  });

  it("healthy live coupon → no warnings", () => {
    expect(buildCouponWarnings(facts({ expiresAt: "2026-12-31T00:00:00Z" }))).toEqual([]);
  });

  it("topSeverity picks the worst present", () => {
    expect(topSeverity(buildCouponWarnings(facts({ eligibleProductCount: 0, maxUses: 100, usedCount: 95 })))).toBe("critical");
    expect(topSeverity(buildCouponWarnings(facts({ maxUses: 100, usedCount: 95 })))).toBe("warning");
    expect(topSeverity(buildCouponWarnings(facts({ expiresAt: null, hasIncludes: false })))).toBe("info");
  });
});
