import { describe, it, expect } from "vitest";
import {
  CANCEL_REASONS, customerSafePhrase, requiresTypedConfirm, CANCEL_CONFIRM_THRESHOLD,
  cancelImpact, refundAmountForType, type CancelImpactInput, type RefundBreakdown,
} from "@/lib/admin/orderDialogs";

describe("cancel/refund dialog logic", () => {
  // ── reason taxonomy + the leak guard ──
  it("every sub-reason carries a customer-safe phrase", () => {
    for (const cat of CANCEL_REASONS)
      for (const sub of cat.subReasons)
        expect(sub.customerSafe.length).toBeGreaterThan(0);
  });

  it("fraud phrasing NEVER leaks the internal word to the customer", () => {
    const fraud = CANCEL_REASONS.find((c) => c.type === "fraud")!;
    for (const sub of fraud.subReasons) {
      expect(sub.customerSafe.toLowerCase()).not.toContain("fraud");
      expect(sub.customerSafe.toLowerCase()).not.toContain("chargeback");
      expect(sub.customerSafe.toLowerCase()).not.toContain("suspicious");
    }
    expect(customerSafePhrase("fraud", "suspicious")).toBe("We were unable to verify this order.");
  });

  it("customerSafePhrase falls back to a neutral line for an unknown sub-reason", () => {
    expect(customerSafePhrase("customer", "does_not_exist")).toBe("Your order has been cancelled.");
    expect(customerSafePhrase("customer", "changed_mind")).toBe("At your request.");
  });

  // ── typed-confirm guard ──
  it("requires typing CANCEL only at/above the threshold", () => {
    expect(requiresTypedConfirm(CANCEL_CONFIRM_THRESHOLD - 1)).toBe(false);
    expect(requiresTypedConfirm(CANCEL_CONFIRM_THRESHOLD)).toBe(true);
    expect(requiresTypedConfirm(50_000)).toBe(true);
  });

  // ── honest impact preview ──
  const base: CancelImpactInput = {
    units: 3, releaseInventory: true, paymentPaid: true, issueRefund: true, refundAmount: 2008,
    gateway: true, couponCode: null, loyaltyPoints: 0, hasInvoice: false,
  };
  it("restock + refund are marked automated; the preview matches what code actually does", () => {
    const rows = cancelImpact(base);
    const inv = rows.find((r) => r.label === "Inventory")!;
    expect(inv).toMatchObject({ value: "+3 units restocked", tone: "ok", automated: true });
    expect(rows.find((r) => r.label === "Reservation")).toMatchObject({ automated: true });
    expect(rows.find((r) => r.label === "Refund")!.value).toContain("₹2008.00 → original payment");
  });

  it("an unpaid order restocks nothing (stock was never decremented)", () => {
    const rows = cancelImpact({ ...base, paymentPaid: false });
    expect(rows.find((r) => r.label === "Inventory")!.value).toBe("nothing to restock (unpaid)");
    // and no refund row at all when nothing was captured
    expect(rows.find((r) => r.label === "Refund")).toBeUndefined();
  });

  it("declining the refund warns that money stays captured — never hidden", () => {
    const rows = cancelImpact({ ...base, issueRefund: false });
    expect(rows.find((r) => r.label === "Refund")).toMatchObject({ value: "none — money stays captured", tone: "warn" });
  });

  it("coupon / loyalty / invoice are shown as NOT automated (the honesty rule)", () => {
    const rows = cancelImpact({ ...base, couponCode: "WELCOME10", loyaltyPoints: 120, hasInvoice: true });
    const coupon = rows.find((r) => r.label === "Coupon")!;
    const loyalty = rows.find((r) => r.label === "Loyalty")!;
    const invoice = rows.find((r) => r.label === "Invoice")!;
    expect(coupon).toMatchObject({ automated: false, tone: "warn" });
    expect(coupon.value).toContain("not auto-released");
    expect(loyalty).toMatchObject({ automated: false });
    expect(loyalty.value).toContain("not auto-reversed");
    expect(invoice).toMatchObject({ automated: false });
    expect(invoice.value).toContain("void manually");
  });

  // ── refund type math, always clamped to remaining ──
  const bd: RefundBreakdown = { products: 1800, shipping: 120, tax: 88, total: 2008, alreadyRefunded: 500, remaining: 1508 };
  it("full = remaining; shipping = the shipping line; partial = the entered figure", () => {
    expect(refundAmountForType("full", bd, 0)).toBe(1508);
    expect(refundAmountForType("shipping", bd, 0)).toBe(120);
    expect(refundAmountForType("partial", bd, 300)).toBe(300);
  });

  it("every type is clamped to [0, remaining] — the UI can't propose an over-refund", () => {
    expect(refundAmountForType("partial", bd, 99999)).toBe(1508); // clamped down to remaining
    expect(refundAmountForType("partial", bd, -50)).toBe(0); // clamped up to 0
    // shipping larger than remaining is capped at remaining
    expect(refundAmountForType("shipping", { ...bd, shipping: 5000, remaining: 200 }, 0)).toBe(200);
    // NaN is treated as 0, never leaks through
    expect(refundAmountForType("partial", bd, NaN)).toBe(0);
  });
});
