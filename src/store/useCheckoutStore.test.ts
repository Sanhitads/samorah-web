import { describe, it, expect, beforeEach } from "vitest";
import { useCheckoutStore, EMPTY_ADDRESS } from "@/store/useCheckoutStore";

const KEY = "samorah_checkout_v1";
const S = () => useCheckoutStore.getState();
const persisted = () => JSON.parse(sessionStorage.getItem(KEY) as string) as { state: Record<string, unknown>; version: number };

const ADDRESS = { fullName: "A", email: "a@b.com", phone: "9000000000", line1: "1", line2: "", city: "Pune", state: "Maharashtra", pincode: "411001" };

describe("checkout store", () => {
  beforeEach(() => {
    S().reset();
    sessionStorage.clear();
  });

  it("CHK-001 — entered inputs round-trip through sessionStorage", () => {
    S().setShip(ADDRESS);
    S().setNotes("Leave at the door");
    S().setCouponCode("WELCOME10");
    expect(persisted().state.ship).toEqual(ADDRESS);
    expect(persisted().state.notes).toBe("Leave at the door");
    expect(persisted().state.couponCode).toBe("WELCOME10");
  });

  it("CHK-002 — persists to sessionStorage, NOT localStorage (checkout PII must die with the tab)", () => {
    S().setShip(ADDRESS);
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("CHK-003 — consent is never persisted; a restored session must re-affirm it", () => {
    S().setConsent(true);
    expect(S().consent).toBe(true); // held in memory for this page life
    expect(persisted().state).not.toHaveProperty("consent");
  });

  it("CHK-004 — no derived state is persisted (calculateOrderTotals stays the one money module)", () => {
    S().setShip(ADDRESS);
    S().setCouponCode("WELCOME10");
    const keys = Object.keys(persisted().state);
    for (const derived of ["subtotal", "tax", "gst", "shipping", "discount", "total", "grandTotal", "orderId", "paymentStatus", "invoice"]) {
      expect(keys).not.toContain(derived);
    }
    // The coupon survives as a CODE only — never as a computed discount.
    expect(keys).toContain("couponCode");
  });

  it("CHK-005 — the persisted key carries a schema version", () => {
    S().setNotes("x");
    expect(persisted().version).toBe(1);
    expect(KEY).toMatch(/_v\d+$/);
  });

  it("CHK-006 — reset() clears every entered input, including consent", () => {
    S().setShip(ADDRESS);
    S().setBill(ADDRESS);
    S().setBillSame(false);
    S().setWantGst(true);
    S().setBiz({ companyName: "Acme", gstin: "27AAAAA0000A1Z5" });
    S().setNotes("x");
    S().setCouponCode("WELCOME10");
    S().setConsent(true);

    S().reset();

    expect(S().ship).toEqual(EMPTY_ADDRESS);
    expect(S().bill).toEqual(EMPTY_ADDRESS);
    expect(S().billSame).toBe(true);
    expect(S().wantGst).toBe(false);
    expect(S().biz).toEqual({ companyName: "", gstin: "" });
    expect(S().notes).toBe("");
    expect(S().couponCode).toBe("");
    expect(S().consent).toBe(false);
    // and the sessionStorage copy holds no leftover PII
    expect(persisted().state.ship).toEqual(EMPTY_ADDRESS);
  });

  it("CHK-007 — no wizard state (checkout is a single page)", () => {
    const s = S() as unknown as Record<string, unknown>;
    for (const wizard of ["step", "nextStep", "prevStep"]) expect(s[wizard]).toBeUndefined();
  });
});
