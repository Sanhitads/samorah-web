import { describe, it, expect } from "vitest";
import { HOLD_REASONS, composeHoldReason, shippingMilestones } from "@/lib/fulfillment/holdReasons";

describe("hold reasons + shipping milestones", () => {
  it("composes the structured label, appending an optional note", () => {
    expect(composeHoldReason("fraud_review")).toBe("Fraud Review");
    expect(composeHoldReason("address_confirmation", "wrong pincode")).toBe("Address Confirmation — wrong pincode");
    expect(composeHoldReason("customer_request", "   ")).toBe("Customer Request"); // blank note ignored
  });

  it("falls back to the raw value for an unknown reason", () => {
    expect(composeHoldReason("legacy_freetext")).toBe("legacy_freetext");
  });

  it("every hold reason has a value + label", () => {
    for (const r of HOLD_REASONS) { expect(r.value).toBeTruthy(); expect(r.label).toBeTruthy(); }
  });

  it("shipping milestones derive from field presence; null when no shipment", () => {
    expect(shippingMilestones(null)).toBeNull();
    expect(shippingMilestones({ status: "shipment_created" })).toEqual({ label: false, awb: false, booked: false });
    expect(shippingMilestones({ labelUrl: "u", awb: "AWB1", status: "courier_assigned" })).toEqual({ label: true, awb: true, booked: true });
    // AWB present implies booked (couriers assign the AWB at booking).
    expect(shippingMilestones({ awb: "AWB2" })!.booked).toBe(true);
    // provider id implies booked even without an AWB yet.
    expect(shippingMilestones({ providerShipmentId: "PS1" })!.booked).toBe(true);
  });
});
