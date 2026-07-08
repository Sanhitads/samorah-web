/**
 * Courier Capability Matrix (§4) + Courier Decision / Shipping Strategy Engine (§5).
 * The Shipping Engine filters couriers by what they SUPPORT, then picks one by a
 * configurable strategy. Selection is data-driven — no courier is hardcoded.
 */
import type { ProviderName } from "./types";

export interface CourierCapability {
  provider: ProviderName;
  courier: string;
  supportsCod: boolean;
  supportsInsurance: boolean;
  fragileOk: boolean;
  dangerousGoodsOk: boolean;
  maxWeightKg?: number;
  maxLengthCm?: number;
  pickupSlaHrs?: number;
  baseCost?: number; // indicative, for the cheapest strategy
  estDays?: number; // indicative, for the fastest strategy
  tier: "standard" | "express" | "luxury";
  zones?: string[]; // serviceable pincode prefixes; undefined/empty = all
  active: boolean;
}

export interface ShipmentRequirements {
  cod: boolean;
  insurance: boolean;
  fragile: boolean;
  dangerousGoods: boolean;
  weightKg: number;
  maxLengthCm: number;
  deliveryPincode: string;
}

function zoneServiceable(c: CourierCapability, pincode: string): boolean {
  if (!c.zones || c.zones.length === 0) return true;
  return c.zones.some((z) => pincode.startsWith(z));
}

/** Couriers that can actually carry this parcel. */
export function capableCouriers(caps: CourierCapability[], req: ShipmentRequirements): CourierCapability[] {
  return caps.filter(
    (c) =>
      c.active &&
      (!req.cod || c.supportsCod) &&
      (!req.insurance || c.supportsInsurance) &&
      (!req.fragile || c.fragileOk) &&
      (!req.dangerousGoods || c.dangerousGoodsOk) &&
      (c.maxWeightKg == null || req.weightKg <= c.maxWeightKg) &&
      (c.maxLengthCm == null || req.maxLengthCm <= c.maxLengthCm) &&
      zoneServiceable(c, req.deliveryPincode),
  );
}

export type CourierStrategy = "cheapest" | "fastest" | "luxury" | "preferred" | "manual";

/** Pick a courier from the eligible set by strategy. Returns null if none serviceable. */
export function decideCourier(
  caps: CourierCapability[],
  req: ShipmentRequirements,
  strategy: CourierStrategy,
  preferredOrder: string[] = [],
): CourierCapability | null {
  const eligible = capableCouriers(caps, req);
  if (eligible.length === 0) return null;
  switch (strategy) {
    case "cheapest":
      return [...eligible].sort((a, b) => (a.baseCost ?? Infinity) - (b.baseCost ?? Infinity))[0];
    case "fastest":
      return [...eligible].sort((a, b) => (a.estDays ?? Infinity) - (b.estDays ?? Infinity))[0];
    case "luxury":
      return eligible.find((c) => c.tier === "luxury") ?? eligible.find((c) => c.tier === "express") ?? eligible[0];
    case "preferred":
      for (const name of preferredOrder) {
        const m = eligible.find((c) => c.courier === name || c.provider === name);
        if (m) return m;
      }
      return eligible[0];
    case "manual":
      return eligible.find((c) => c.provider === "manual") ?? eligible[0];
    default:
      return eligible[0];
  }
}
