import { describe, it, expect } from "vitest";
import { getShippingProvider } from "@/lib/shipping";
import { DEFAULT_WAREHOUSE, DEFAULT_PARCEL, volumetricWeightKg, chargeableWeightKg } from "@/config/logistics";
import type { ShipmentRequest } from "@/lib/shipping/types";

describe("shipping engine — provider abstraction", () => {
  it("defaults to the Manual provider and it is always operable", () => {
    const p = getShippingProvider();
    expect(p.name).toBe("manual");
    expect(p.configured).toBe(true);
  });

  it("falls back to Manual for an unimplemented provider (platform always ships)", () => {
    const p = getShippingProvider("delhivery");
    expect(p.name).toBe("manual");
  });

  it("Manual createShipment returns a usable shipment with deterministic refs", async () => {
    const req: ShipmentRequest = {
      referenceId: "SAM-2026-000009",
      pickup: DEFAULT_WAREHOUSE,
      delivery: { name: "Guest", phone: "9000000000", line1: "1 Road", city: "Bengaluru", state: "Karnataka", pincode: "560045" },
      parcel: { weightKg: 0.6, dimensions: DEFAULT_PARCEL.dimensions, items: [{ name: "Kashmiri Chai", sku: "SKU1", quantity: 1, unitPriceInr: 580 }], declaredValueInr: 580 },
      paymentMode: "prepaid",
    };
    const r = await getShippingProvider("manual").createShipment(req);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("manual");
    expect(r.providerShipmentId).toBe("MAN-SAM-2026-000009");
    expect(r.awb).toBe("MANUAL-SAM-2026-000009");
    expect(r.courierName).toBe("Manual Dispatch");
  });

  it("Manual estimateShipping applies Samorah's free-over-threshold policy", async () => {
    const p = getShippingProvider("manual");
    const paid = await p.estimateShipping({ pickupPincode: "560045", deliveryPincode: "110001", weightKg: 0.6, paymentMode: "prepaid", declaredValueInr: 900 });
    const free = await p.estimateShipping({ pickupPincode: "560045", deliveryPincode: "110001", weightKg: 0.6, paymentMode: "prepaid", declaredValueInr: 5000 });
    expect(paid[0].estimatedCostInr).toBeGreaterThan(0);
    expect(free[0].estimatedCostInr).toBe(0);
  });

  it("weight pipeline: volumetric + chargeable are computed, never overwritten", () => {
    const dims = { lengthCm: 30, widthCm: 20, heightCm: 10 }; // 6000 cm³ / 5000 = 1.2 kg
    expect(volumetricWeightKg(dims)).toBeCloseTo(1.2, 5);
    expect(chargeableWeightKg(0.6, dims)).toBeCloseTo(1.2, 5); // volumetric wins
    expect(chargeableWeightKg(2.0, dims)).toBeCloseTo(2.0, 5); // actual wins
  });
});
