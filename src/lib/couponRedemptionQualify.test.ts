import { describe, it, expect } from "vitest";
import { isQualifyingRedemption, QUALIFYING_REDEMPTION_STATES } from "./couponRedemptionQualify";

/**
 * The redemption state-machine regression matrix (merchant-specified). This is the ONE gate that
 * decides whether a ledger row counts as a Successful Redemption. Proving payment, not inferring it.
 */
describe("isQualifyingRedemption — payment-proven Successful Redemption gate", () => {
  const paid = { orderPaymentStatus: "paid" as string | null };
  const stamp = { consumedAt: "2026-08-01T00:00:00Z" as string | null };

  it("reserved → EXCLUDE (pre-payment hold)", () => {
    expect(isQualifyingRedemption({ state: "reserved", consumedAt: null, orderPaymentStatus: "pending" })).toBe(false);
  });

  it("reserved → released → EXCLUDE (undone)", () => {
    expect(isQualifyingRedemption({ state: "released", consumedAt: null, orderPaymentStatus: "failed" })).toBe(false);
  });

  it("reserved → released → restored, NEVER PAID → EXCLUDE (restored but consumed_at NULL + order not paid)", () => {
    expect(isQualifyingRedemption({ state: "restored", consumedAt: null, orderPaymentStatus: "pending" })).toBe(false);
  });

  it("consumed + paid → INCLUDE", () => {
    expect(isQualifyingRedemption({ state: "consumed", ...stamp, ...paid })).toBe(true);
  });

  it("consumed + partially_refunded → INCLUDE (partially_refunded ∈ PAID)", () => {
    expect(isQualifyingRedemption({ state: "consumed", consumedAt: "x", orderPaymentStatus: "partially_refunded" })).toBe(true);
  });

  it("consumed + fully refunded → INCLUDE (a real historical redemption; revenue nets to ₹0 later)", () => {
    expect(isQualifyingRedemption({ state: "consumed", consumedAt: "x", orderPaymentStatus: "refunded" })).toBe(true);
  });

  it("consumed → released → restored WITH payment proof → INCLUDE", () => {
    expect(isQualifyingRedemption({ state: "restored", consumedAt: "x", orderPaymentStatus: "paid" })).toBe(true);
  });

  it("payment_status=paid but consumed_at NULL → EXCLUDE (no ledger payment stamp)", () => {
    expect(isQualifyingRedemption({ state: "consumed", consumedAt: null, orderPaymentStatus: "paid" })).toBe(false);
  });

  it("consumed_at exists but order NOT in paid-state set → EXCLUDE", () => {
    expect(isQualifyingRedemption({ state: "consumed", consumedAt: "x", orderPaymentStatus: "pending" })).toBe(false);
  });

  it("cancelled order → EXCLUDE", () => {
    expect(isQualifyingRedemption({ state: "released", consumedAt: "x", orderPaymentStatus: "cancelled" })).toBe(false);
  });

  it("null/garbage fields → EXCLUDE (never throws)", () => {
    expect(isQualifyingRedemption({ state: null, consumedAt: null, orderPaymentStatus: null })).toBe(false);
    expect(isQualifyingRedemption({ state: "consumed", consumedAt: "x", orderPaymentStatus: undefined })).toBe(false);
  });

  it("only consumed + restored are qualifying states", () => {
    expect([...QUALIFYING_REDEMPTION_STATES].sort()).toEqual(["consumed", "restored"]);
  });
});
