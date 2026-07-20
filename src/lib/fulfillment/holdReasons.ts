/**
 * Structured hold + shipping-milestone helpers (warehouse Phase 3). Pure + testable.
 *
 * Hold reasons: the board today stores a FREE-TEXT hold reason. This gives a fixed taxonomy so holds
 * become reportable/filterable, while still storing into the SAME existing `fulfillment_hold_reason`
 * column (no schema) — the structured label is what's written, an optional note is appended.
 *
 * Shipping milestones: derived from `shipments` field presence — no new timestamps needed. Label
 * ready ⇐ label_url; AWB assigned ⇐ awb; Courier booked ⇐ provider id / courier_assigned status.
 */

// ── Hold reasons (point 10) ──────────────────────────────────────────────────
export interface HoldReason {
  value: string;
  label: string;
}
export const HOLD_REASONS: HoldReason[] = [
  { value: "payment_verification", label: "Payment Verification" },
  { value: "fraud_review", label: "Fraud Review" },
  { value: "inventory_issue", label: "Inventory Issue" },
  { value: "address_confirmation", label: "Address Confirmation" },
  { value: "customer_request", label: "Customer Request" },
];

/** Compose the reason string written to fulfillment_hold_reason: the structured label, plus an
 *  optional free-text note. Falls back gracefully for an unknown value. */
export function composeHoldReason(value: string, note?: string): string {
  const label = HOLD_REASONS.find((r) => r.value === value)?.label ?? value;
  const n = note?.trim();
  return n ? `${label} — ${n}` : label;
}

// ── Shipping milestones (point 9) ────────────────────────────────────────────
export interface ShipmentMilestoneInput {
  status?: string | null;
  labelUrl?: string | null;
  awb?: string | null;
  providerShipmentId?: string | null;
}
export interface ShippingMilestones {
  label: boolean; // label generated
  awb: boolean; // AWB assigned
  booked: boolean; // courier booked
}
/** The three shipping milestones an operator reads at a glance. Derived from field presence —
 *  returns null when no shipment exists yet (nothing to show). */
export function shippingMilestones(sh: ShipmentMilestoneInput | null | undefined): ShippingMilestones | null {
  if (!sh) return null;
  const awb = Boolean(sh.awb);
  return {
    label: Boolean(sh.labelUrl),
    awb,
    // Booked = the courier has the shipment: an explicit provider id, or the fulfillment/shipment
    // state has reached courier_assigned, or an AWB exists (couriers assign an AWB on booking).
    booked: Boolean(sh.providerShipmentId) || sh.status === "courier_assigned" || awb,
  };
}
