import { describe, it, expect } from "vitest";
import { capableCouriers, decideCourier, type CourierCapability, type ShipmentRequirements } from "@/lib/shipping/decision";

const caps: CourierCapability[] = [
  { provider: "manual", courier: "Manual Dispatch", supportsCod: true, supportsInsurance: false, fragileOk: true, dangerousGoodsOk: false, tier: "standard", baseCost: 0, estDays: 5, active: true },
  { provider: "shiprocket", courier: "Shadowfax", supportsCod: true, supportsInsurance: true, fragileOk: true, dangerousGoodsOk: false, maxWeightKg: 5, tier: "standard", baseCost: 55, estDays: 3, zones: ["56", "11"], active: true },
  { provider: "delhivery", courier: "Delhivery", supportsCod: true, supportsInsurance: true, fragileOk: true, dangerousGoodsOk: true, maxWeightKg: 20, tier: "express", baseCost: 80, estDays: 2, active: true },
  { provider: "bluedart", courier: "Blue Dart", supportsCod: false, supportsInsurance: true, fragileOk: true, dangerousGoodsOk: false, maxWeightKg: 10, tier: "luxury", baseCost: 140, estDays: 1, active: true },
  { provider: "shiprocket", courier: "Old Courier", supportsCod: true, supportsInsurance: true, fragileOk: true, dangerousGoodsOk: false, tier: "standard", baseCost: 40, estDays: 6, active: false },
];

const req = (o: Partial<ShipmentRequirements> = {}): ShipmentRequirements => ({
  cod: false, insurance: false, fragile: false, dangerousGoods: false, weightKg: 0.6, maxLengthCm: 30, deliveryPincode: "560045", ...o,
});

describe("courier capability matrix (§4)", () => {
  it("excludes inactive couriers", () => {
    expect(capableCouriers(caps, req()).some((c) => c.courier === "Old Courier")).toBe(false);
  });
  it("COD requirement excludes non-COD couriers (Blue Dart)", () => {
    expect(capableCouriers(caps, req({ cod: true })).some((c) => c.courier === "Blue Dart")).toBe(false);
  });
  it("insurance requirement excludes Manual (no insurance)", () => {
    expect(capableCouriers(caps, req({ insurance: true })).some((c) => c.provider === "manual")).toBe(false);
  });
  it("weight over a courier's max excludes it (Shadowfax max 5kg)", () => {
    expect(capableCouriers(caps, req({ weightKg: 8 })).some((c) => c.courier === "Shadowfax")).toBe(false);
  });
  it("zone gating: Shadowfax serves 56*/11* only", () => {
    expect(capableCouriers(caps, req({ deliveryPincode: "400001" })).some((c) => c.courier === "Shadowfax")).toBe(false);
    expect(capableCouriers(caps, req({ deliveryPincode: "560045" })).some((c) => c.courier === "Shadowfax")).toBe(true);
  });
  it("dangerous goods requirement leaves only Delhivery", () => {
    const out = capableCouriers(caps, req({ dangerousGoods: true }));
    expect(out.map((c) => c.courier)).toEqual(["Delhivery"]);
  });
});

describe("courier decision / strategy engine (§5)", () => {
  it("cheapest → Manual (₹0)", () => {
    expect(decideCourier(caps, req(), "cheapest")?.courier).toBe("Manual Dispatch");
  });
  it("fastest → Blue Dart (1 day)", () => {
    expect(decideCourier(caps, req(), "fastest")?.courier).toBe("Blue Dart");
  });
  it("luxury → Blue Dart (luxury tier)", () => {
    expect(decideCourier(caps, req(), "luxury")?.courier).toBe("Blue Dart");
  });
  it("preferred honours the given order", () => {
    expect(decideCourier(caps, req(), "preferred", ["Delhivery", "Shadowfax"])?.courier).toBe("Delhivery");
  });
  it("manual → the Manual provider", () => {
    expect(decideCourier(caps, req(), "manual")?.provider).toBe("manual");
  });
  it("returns null when nothing is serviceable", () => {
    expect(decideCourier([], req(), "cheapest")).toBeNull();
    expect(decideCourier(caps, req({ cod: true, deliveryPincode: "999999", insurance: true, weightKg: 50 }), "cheapest")).toBeNull();
  });
});
