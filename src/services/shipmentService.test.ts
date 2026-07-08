import { describe, it, expect } from "vitest";
import { buildShipmentRequest, type ShippableOrder } from "@/services/shipmentService";
import { DEFAULT_WAREHOUSE } from "@/config/logistics";

const order: ShippableOrder = {
  order_number: "SAM-2026-000009",
  email: "guest@example.com",
  ship_full_name: "Sanhita Das",
  ship_phone: "9958528159",
  ship_line1: "1166, 1st Floor",
  ship_line2: "HBR Layout",
  ship_city: "Bengaluru",
  ship_state: "Karnataka",
  ship_pincode: "560045",
  total_amount: 1160,
  shipping_amount: 0,
  order_items: [
    { product_name: "Kashmiri Chai", sku: "SAM-CAN-001-100G-GL", quantity: 1, unit_price: 580, hsn_code: "3406" },
    { product_name: "Modak", sku: "SAM-CAN-002-100G-GL", quantity: 2, unit_price: 580, hsn_code: "3406" },
  ],
};

describe("buildShipmentRequest — order → provider-agnostic shipment request", () => {
  it("maps delivery address, items, declared value, and pickup warehouse", () => {
    const req = buildShipmentRequest(order);
    expect(req.referenceId).toBe("SAM-2026-000009");
    expect(req.pickup.id).toBe(DEFAULT_WAREHOUSE.id);
    expect(req.delivery.pincode).toBe("560045");
    expect(req.delivery.phone).toBe("9958528159");
    expect(req.parcel.declaredValueInr).toBe(1160);
    expect(req.parcel.items).toHaveLength(2);
    expect(req.parcel.items[1]).toMatchObject({ sku: "SAM-CAN-002-100G-GL", quantity: 2, unitPriceInr: 580 });
    expect(req.paymentMode).toBe("prepaid");
  });

  it("computes a chargeable parcel weight (never zero for a real parcel)", () => {
    const req = buildShipmentRequest(order);
    expect(req.parcel.weightKg).toBeGreaterThan(0);
    expect(req.parcel.dimensions.lengthCm).toBeGreaterThan(0);
  });
});
