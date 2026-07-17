import { describe, it, expect } from "vitest";
import { orderHealth, HEALTH_ORDER, type HealthInput } from "@/lib/admin/orderHealth";

const base: HealthInput = {
  status: "confirmed",
  paymentStatus: "paid",
  fraudReview: null,
  hasOpenIncident: false,
  refundPending: false,
  ndrStatus: null,
  fulfillmentStatus: null,
  shipmentException: false,
};

describe("order health (Phase 3 — computed, never stored)", () => {
  it("a normal paid order is Healthy", () => {
    expect(orderHealth(base).state).toBe("healthy");
  });

  it("each signal maps to its state", () => {
    expect(orderHealth({ ...base, fraudReview: "pending_review" }).state).toBe("fraud");
    expect(orderHealth({ ...base, hasOpenIncident: true }).state).toBe("incident");
    expect(orderHealth({ ...base, refundPending: true }).state).toBe("refund_pending");
    expect(orderHealth({ ...base, ndrStatus: "rto" }).state).toBe("delayed");
    expect(orderHealth({ ...base, fulfillmentStatus: "on_hold" }).state).toBe("delayed");
    expect(orderHealth({ ...base, shipmentException: true }).state).toBe("delayed");
    expect(orderHealth({ ...base, paymentStatus: "failed" }).state).toBe("attention");
    expect(orderHealth({ ...base, ndrStatus: "re_attempt_scheduled" }).state).toBe("attention");
  });

  it("a CLEARED fraud review is not a health concern (only active reviews flag)", () => {
    expect(orderHealth({ ...base, fraudReview: "cleared" }).state).toBe("healthy");
    expect(orderHealth({ ...base, fraudReview: "confirmed_fraud" }).state).toBe("fraud");
  });

  it("works BEFORE the fraud_review column exists (undefined → never flags fraud)", () => {
    const withoutColumn = { ...base } as HealthInput;
    delete withoutColumn.fraudReview;
    expect(orderHealth(withoutColumn).state).toBe("healthy");
  });

  it("precedence: the most blocking signal wins when several fire", () => {
    // fraud > incident > refund > delayed > attention
    expect(orderHealth({ ...base, fraudReview: "under_investigation", hasOpenIncident: true, refundPending: true }).state).toBe("fraud");
    expect(orderHealth({ ...base, hasOpenIncident: true, refundPending: true, ndrStatus: "rto" }).state).toBe("incident");
    expect(orderHealth({ ...base, refundPending: true, fulfillmentStatus: "on_hold" }).state).toBe("refund_pending");
    expect(orderHealth({ ...base, fulfillmentStatus: "on_hold", paymentStatus: "failed" }).state).toBe("delayed");
  });

  it("the switch order matches the declared precedence list exactly", () => {
    // Turning on every signal at once must yield the first state in HEALTH_ORDER.
    const allOn: HealthInput = { ...base, fraudReview: "pending_review", hasOpenIncident: true, refundPending: true, ndrStatus: "rto", fulfillmentStatus: "on_hold", shipmentException: true, paymentStatus: "failed" };
    expect(orderHealth(allOn).state).toBe(HEALTH_ORDER[0]);
  });

  it("every state carries a dot, label, tone and a human reason", () => {
    for (const input of [base, { ...base, hasOpenIncident: true }, { ...base, refundPending: true }, { ...base, fraudReview: "pending_review" }]) {
      const h = orderHealth(input);
      expect(h.dot.length).toBeGreaterThan(0);
      expect(h.label.length).toBeGreaterThan(0);
      expect(h.tone.length).toBeGreaterThan(0);
      expect(h.reason.length).toBeGreaterThan(0);
    }
  });
});
