/**
 * Logistics configuration — provider selection + dynamic pickup (warehouse) +
 * default parcel. Business rules live in Samorah, never in a courier. Provider is
 * chosen by env (default "manual"); warehouses are data (an order picks one).
 */
import { COMMERCE } from "@/config/commerce";
import type { PickupLocation, ProviderName, ParcelDimensions } from "@/lib/shipping/types";

/** Active shipping provider — flip to "shiprocket" once that adapter (Slice 5) lands. */
export const SHIPPING_PROVIDER = (process.env.SHIPPING_PROVIDER as ProviderName | undefined) ?? "manual";

/** Pickup locations (dynamic). Today one studio; add warehouses without code changes. */
export const WAREHOUSES: PickupLocation[] = [
  {
    id: "wh_blr",
    name: "Samorah Studio — Bengaluru",
    gstin: COMMERCE.gstin,
    address: {
      name: COMMERCE.brandName,
      phone: COMMERCE.support.phone,
      line1: COMMERCE.registeredAddress.line1,
      line2: COMMERCE.registeredAddress.line2,
      city: COMMERCE.registeredAddress.city,
      state: COMMERCE.registeredAddress.state,
      pincode: COMMERCE.registeredAddress.pincode,
      country: COMMERCE.registeredAddress.country,
    },
  },
];

export const DEFAULT_WAREHOUSE = WAREHOUSES[0];
export function warehouseById(id: string): PickupLocation | undefined {
  return WAREHOUSES.find((w) => w.id === id);
}

/**
 * Default parcel — PLACEHOLDER. Replace with real values from the Packaging Engine
 * (Slice 3) once box weights/dimensions are known. Live rate estimation + external
 * shipment creation depend on accurate numbers, so these are provisional.
 */
export const DEFAULT_PARCEL: { weightKg: number; dimensions: ParcelDimensions } = {
  weightKg: 0.6, // TODO(packaging): net product + packaging weight
  dimensions: { lengthCm: 12, widthCm: 12, heightCm: 12 }, // TODO(packaging): real box dims
};

/** Volumetric weight (kg) — computed AFTER packaging is chosen. Divisor 5000 (road/air std). */
export function volumetricWeightKg(d: ParcelDimensions, divisor = 5000): number {
  return (d.lengthCm * d.widthCm * d.heightCm) / divisor;
}

/** Chargeable weight = max(actual shipping weight, volumetric weight). */
export function chargeableWeightKg(shippingWeightKg: number, d: ParcelDimensions): number {
  return Math.max(shippingWeightKg, volumetricWeightKg(d));
}
