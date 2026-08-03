import { describe, it, expect } from "vitest";
import { couponStatus, couponIsLive, type CouponStatusInput } from "@/lib/couponStatus";
import { istLocalToUtc, utcToIstLocal, formatIST } from "@/lib/istTime";

const NOW = new Date("2026-08-15T12:00:00Z"); // fixed reference
const base: CouponStatusInput = { status: "active", startsAt: null, expiresAt: null, maxUses: null, usedCount: 0 };

describe("couponStatus — precedence (intent wins, then temporal, then usage)", () => {
  it("explicit intent overrides everything", () => {
    // Archived even if it would otherwise be 'active'.
    expect(couponStatus({ ...base, status: "archived" }, NOW).status).toBe("archived");
    expect(couponStatus({ ...base, status: "draft" }, NOW).status).toBe("draft");
    expect(couponStatus({ ...base, status: "paused" }, NOW).status).toBe("paused");
    // Even an expired+exhausted coupon shows Paused if intent is paused (intent wins).
    expect(couponStatus({ status: "paused", expiresAt: "2020-01-01T00:00:00Z", maxUses: 1, usedCount: 5 }, NOW).status).toBe("paused");
  });

  it("active intent derives scheduled → expired → exhausted → active", () => {
    expect(couponStatus({ ...base, startsAt: "2026-08-20T00:00:00Z" }, NOW).status).toBe("scheduled");
    expect(couponStatus({ ...base, expiresAt: "2026-08-10T00:00:00Z" }, NOW).status).toBe("expired");
    expect(couponStatus({ ...base, maxUses: 100, usedCount: 100 }, NOW).status).toBe("exhausted");
    expect(couponStatus({ ...base, expiresAt: "2026-09-01T00:00:00Z", maxUses: 100, usedCount: 5 }, NOW).status).toBe("active");
    // scheduled takes precedence over an also-would-be-exhausted state.
    expect(couponStatus({ ...base, startsAt: "2026-08-20T00:00:00Z", maxUses: 1, usedCount: 5 }, NOW).status).toBe("scheduled");
  });

  it("boundary: starts_at INCLUSIVE, expires_at EXCLUSIVE", () => {
    // starts_at == now → live (inclusive), not scheduled.
    expect(couponStatus({ ...base, startsAt: NOW.toISOString() }, NOW).status).toBe("active");
    // expires_at == now → expired (exclusive end).
    expect(couponStatus({ ...base, expiresAt: NOW.toISOString() }, NOW).status).toBe("expired");
    // one ms before expiry → still active.
    expect(couponStatus({ ...base, expiresAt: new Date(NOW.getTime() + 1).toISOString() }, NOW).status).toBe("active");
  });

  it("reason strings are human-readable", () => {
    expect(couponStatus({ ...base, maxUses: 100, usedCount: 100 }, NOW).reason).toBe("100 / 100 redemptions used");
    expect(couponStatus({ ...base, expiresAt: "2026-08-10T00:00:00Z" }, NOW).reason).toMatch(/^Expired .* IST$/);
  });

  it("couponIsLive is true only for the effective 'active' state", () => {
    expect(couponIsLive({ ...base, expiresAt: "2026-09-01T00:00:00Z" }, NOW)).toBe(true);
    expect(couponIsLive({ ...base, status: "paused" }, NOW)).toBe(false);
    expect(couponIsLive({ ...base, status: "archived" }, NOW)).toBe(false);
    expect(couponIsLive({ ...base, startsAt: "2026-08-20T00:00:00Z" }, NOW)).toBe(false); // scheduled
    expect(couponIsLive({ ...base, expiresAt: "2026-08-10T00:00:00Z" }, NOW)).toBe(false); // expired
  });
});

describe("IST time helpers — fixed +05:30, round-trip", () => {
  it("istLocalToUtc treats the input as IST wall-clock", () => {
    // 11:59 PM IST on 20 Aug = 18:29 UTC same day.
    expect(istLocalToUtc("2026-08-20T23:59")).toBe("2026-08-20T18:29:00.000Z");
    expect(istLocalToUtc("")).toBeNull();
  });
  it("utcToIstLocal shifts a UTC instant into IST wall-clock", () => {
    expect(utcToIstLocal("2026-08-20T18:29:00.000Z")).toBe("2026-08-20T23:59");
  });
  it("round-trips exactly", () => {
    const local = "2026-08-10T10:00";
    expect(utcToIstLocal(istLocalToUtc(local))).toBe(local);
  });
  it("formatIST renders in IST with the zone label", () => {
    // 18:29 UTC → 11:59 PM IST, 20 Aug 2026.
    expect(formatIST("2026-08-20T18:29:00.000Z")).toContain("IST");
    expect(formatIST("2026-08-20T18:29:00.000Z")).toMatch(/20 Aug 2026/);
    expect(formatIST(null)).toBe("");
  });
});
