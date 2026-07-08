/**
 * Fulfillment state machine (§1) — the warehouse WIP layer, finer than order and
 * shipment status. Sits under the Fulfillment umbrella (§13: Picking · Packing ·
 * Packaging · QC · Dispatch). Shipping only begins once fulfillment reaches
 * ready_for_dispatch (§14). Pure — guards every fulfillment write.
 */
export const FULFILLMENT_STATUSES = [
  "reserved",
  "picking",
  "picked",
  "packing",
  "packed",
  "qc_passed",
  "qc_failed",
  "ready_for_dispatch",
  "courier_assigned",
  "picked_up",
  "shipped",
  "on_hold",
  "cancelled",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

const TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  reserved: ["picking", "on_hold", "cancelled"],
  picking: ["picked", "on_hold", "cancelled"],
  picked: ["packing", "on_hold", "cancelled"],
  packing: ["packed", "on_hold", "cancelled"],
  packed: ["qc_passed", "qc_failed", "on_hold"],
  qc_failed: ["packing", "cancelled"], // rework
  qc_passed: ["ready_for_dispatch"],
  ready_for_dispatch: ["courier_assigned", "on_hold"],
  courier_assigned: ["picked_up", "on_hold"],
  picked_up: ["shipped"],
  shipped: [], // handoff to Shipping/Tracking
  on_hold: ["picking", "packing", "ready_for_dispatch", "cancelled"], // resume or cancel
  cancelled: [],
};

export function isTerminalFulfillment(s: FulfillmentStatus): boolean {
  return TRANSITIONS[s].length === 0;
}
export function canTransitionFulfillment(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
export function assertFulfillmentTransition(from: FulfillmentStatus, to: FulfillmentStatus): void {
  if (!canTransitionFulfillment(from, to)) {
    throw new Error(`Illegal fulfillment transition: ${from} → ${to}`);
  }
}
export function nextFulfillmentStates(from: FulfillmentStatus): FulfillmentStatus[] {
  return [...TRANSITIONS[from]];
}

/** §14 gate — shipping may only be created once fulfillment is packed + QC-passed. */
export function fulfillmentReadyToShip(s: FulfillmentStatus): boolean {
  return s === "ready_for_dispatch" || s === "courier_assigned" || s === "picked_up" || s === "shipped";
}

/** Map a fulfillment status onto the coarse order status (kept in sync, not replaced). */
export function fulfillmentToOrderStatus(s: FulfillmentStatus): "processing" | "packed" | "shipped" | "cancelled" | null {
  if (s === "cancelled") return "cancelled";
  if (s === "shipped" || s === "picked_up" || s === "courier_assigned") return "shipped";
  if (s === "packed" || s === "qc_passed" || s === "ready_for_dispatch") return "packed";
  if (s === "reserved" || s === "picking" || s === "picked" || s === "packing") return "processing";
  return null; // qc_failed / on_hold → leave order status unchanged
}
