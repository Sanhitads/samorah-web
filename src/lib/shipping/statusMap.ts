/**
 * Provider status → unified ShipmentStatus mapping. Couriers each speak their own
 * status vocabulary; the Tracking Engine maps them onto OUR machine so the customer
 * timeline and internal lifecycle are identical regardless of courier. Add
 * provider-specific overrides as adapters land (Shiprocket/Delhivery/…).
 */
import type { ProviderName } from "./types";
import type { ShipmentStatus } from "@/lib/shipment/state";

const GENERIC: Record<string, ShipmentStatus> = {
  picked_up: "picked_up",
  pickup: "picked_up",
  pickup_done: "picked_up",
  shipped: "picked_up",
  in_transit: "in_transit",
  intransit: "in_transit",
  "in transit": "in_transit",
  out_for_delivery: "out_for_delivery",
  ofd: "out_for_delivery",
  "out for delivery": "out_for_delivery",
  delivered: "delivered",
  rto: "rto",
  rto_delivered: "rto",
  rto_in_transit: "rto",
  returned: "rto",
  exception: "exception",
  ndr: "exception",
  undelivered: "exception",
  failed: "exception",
  lost: "exception",
  damaged: "exception",
  cancelled: "cancelled",
  canceled: "cancelled",
};

// Per-provider overrides layer on top of GENERIC (empty until adapters exist).
const OVERRIDES: Partial<Record<ProviderName, Record<string, ShipmentStatus>>> = {};

/** Map a raw courier status to our unified status, or null if unrecognised. */
export function mapProviderStatus(provider: ProviderName, raw: string): ShipmentStatus | null {
  const key = raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return OVERRIDES[provider]?.[key] ?? GENERIC[key] ?? GENERIC[raw.toLowerCase().trim()] ?? null;
}
