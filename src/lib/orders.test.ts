import { describe, it, expect } from "vitest";
import {
  reservationExpiry,
  isReservationExpired,
  canReuseRazorpayOrder,
  canCancel,
  invoiceNumber,
  type StockReservation,
} from "@/lib/orders";

describe("orders — reliability helpers", () => {
  it("reservation expiry — active + past TTL → expired; consumed never expires", () => {
    const createdAt = "2026-05-01T10:00:00.000Z";
    const expiresAt = reservationExpiry(createdAt);
    const r: StockReservation = { id: "r1", orderId: "o1", variantId: "v1", qty: 1, status: "active", createdAt, expiresAt };
    expect(isReservationExpired(r, "2026-05-01T10:10:00.000Z")).toBe(false); // within 15 min
    expect(isReservationExpired(r, "2026-05-01T10:20:00.000Z")).toBe(true); // past 15 min
    expect(isReservationExpired({ ...r, status: "consumed" }, "2026-05-01T11:00:00.000Z")).toBe(false);
  });

  it("Razorpay retry — reuse the same order while payment is open, never when captured", () => {
    expect(canReuseRazorpayOrder({ razorpayOrderId: "order_x", paymentStatus: "failed" })).toBe(true);
    expect(canReuseRazorpayOrder({ razorpayOrderId: "order_x", paymentStatus: "pending" })).toBe(true);
    expect(canReuseRazorpayOrder({ razorpayOrderId: "order_x", paymentStatus: "captured" })).toBe(false);
    expect(canReuseRazorpayOrder({ razorpayOrderId: null, paymentStatus: "failed" })).toBe(false);
  });

  it("cancellation window — cancellable up to 'packed', not after 'shipped'", () => {
    expect(canCancel("pending_payment")).toBe(true);
    expect(canCancel("paid")).toBe(true);
    expect(canCancel("packed")).toBe(true);
    expect(canCancel("shipped")).toBe(false);
    expect(canCancel("delivered")).toBe(false);
  });

  it("invoice numbering — FY format SAM/26-27/000001, allocated on payment", () => {
    expect(invoiceNumber(1, new Date("2026-05-01T00:00:00Z"))).toBe("SAM/26-27/000001"); // May → FY 26-27
    expect(invoiceNumber(42, new Date("2027-02-01T00:00:00Z"))).toBe("SAM/26-27/000042"); // Feb → still FY 26-27
    expect(invoiceNumber(1, new Date("2026-03-31T00:00:00Z"))).toBe("SAM/25-26/000001"); // Mar → FY 25-26
  });
});
