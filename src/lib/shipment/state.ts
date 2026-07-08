/**
 * Shipment state machine — the unified lifecycle every parcel follows, regardless
 * of courier. Providers report raw statuses; the Tracking Engine maps them onto
 * THIS machine, so the customer timeline is identical whether a parcel ships
 * manually or via Shiprocket/Delhivery. `assertTransition` guards every write.
 */
export const SHIPMENT_STATUSES = [
  "pending",
  "ready_to_ship",
  "shipment_created",
  "courier_assigned",
  "label_generated",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "rto",
  "cancelled",
  "exception",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  pending: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipment_created", "cancelled"],
  shipment_created: ["courier_assigned", "cancelled"],
  courier_assigned: ["label_generated", "cancelled"],
  label_generated: ["pickup_scheduled", "cancelled"],
  pickup_scheduled: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "exception"],
  in_transit: ["out_for_delivery", "exception", "rto"],
  out_for_delivery: ["delivered", "exception", "rto"],
  exception: ["in_transit", "out_for_delivery", "delivered", "rto"],
  delivered: [],
  rto: [],
  cancelled: [],
};

export function isTerminalShipment(s: ShipmentStatus): boolean {
  return TRANSITIONS[s].length === 0;
}
export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
export function assertShipmentTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (!canTransitionShipment(from, to)) {
    throw new Error(`Illegal shipment transition: ${from} → ${to}`);
  }
}
export function nextShipmentStates(from: ShipmentStatus): ShipmentStatus[] {
  return [...TRANSITIONS[from]];
}

// ── Tracking Engine: unified customer-facing status ───────────────────────────
export type CustomerShipmentStatus =
  | "preparing"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "cancelled"
  | "exception";

const CUSTOMER_MAP: Record<ShipmentStatus, CustomerShipmentStatus> = {
  pending: "preparing",
  ready_to_ship: "preparing",
  shipment_created: "preparing",
  courier_assigned: "preparing",
  label_generated: "preparing",
  pickup_scheduled: "preparing",
  picked_up: "shipped",
  in_transit: "in_transit",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  rto: "returned",
  cancelled: "cancelled",
  exception: "exception",
};

/** Collapse the internal machine to the small set a customer sees. */
export function toCustomerStatus(s: ShipmentStatus): CustomerShipmentStatus {
  return CUSTOMER_MAP[s];
}

export const CUSTOMER_STATUS_LABEL: Record<CustomerShipmentStatus, string> = {
  preparing: "Preparing",
  shipped: "Shipped",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
  exception: "Delivery Exception",
};
