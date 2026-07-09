import { describe, it, expect } from "vitest";
import { buildCancellationEmail } from "@/lib/email";

describe("ORDER_CANCELLED email", () => {
  it("renders reason + refund block with amount and a timeline", () => {
    const { subject, html, text } = buildCancellationEmail({
      order_number: "SAM-2026-000011",
      ship_full_name: "Sanhita Das",
      email: "guest@example.com",
      reason: "Customer requested cancellation",
      refund: { amount: 1527, status: "processing", method: "gateway" },
    });
    expect(subject).toContain("has been cancelled");
    expect(html).toContain("Customer requested cancellation");
    expect(html).toContain("₹1527.00");
    expect(html).toMatch(/5–7 business days/); // gateway timeline
    expect(html).toContain("Order Cancelled");
    expect(html).not.toContain("localhost");
    expect(text).toContain("Refund: ₹1527.00");
    expect(text).not.toContain("<td");
  });

  it("omits the refund block entirely when there is no refund (cancel ≠ refund)", () => {
    const { html, text } = buildCancellationEmail({
      order_number: "SAM-2026-000012",
      ship_full_name: "A B",
      email: "x@y.com",
      reason: "Duplicate order",
      refund: null,
    });
    expect(html).not.toMatch(/Refund/);
    expect(html).not.toMatch(/business days/);
    expect(text).not.toMatch(/Refund:/);
    expect(html).toContain("Duplicate order");
  });

  it("does not show money for a failed refund", () => {
    const { html } = buildCancellationEmail({
      order_number: "SAM-2026-000013",
      email: "x@y.com",
      reason: "Out of stock",
      refund: { amount: 900, status: "failed", method: "gateway" },
    });
    expect(html).not.toContain("₹900.00");
  });

  it("uses a manual-refund timeline when processed out-of-band", () => {
    const { html } = buildCancellationEmail({
      order_number: "SAM-2026-000014",
      email: "x@y.com",
      reason: "COD cancellation",
      refund: { amount: 500, status: "processing", method: "manual" },
    });
    expect(html).toMatch(/process this refund shortly/);
  });
});
