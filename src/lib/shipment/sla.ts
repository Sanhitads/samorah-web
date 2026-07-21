/**
 * Shipment SLA — the delivery-window equivalent of the fulfillment SLA. It answers the operator's
 * question for a parcel: is it on track, close to late, or late? Pure + testable; the reader computes
 * it, the board renders it. No schema — derived from the shipment's created_at + (delivered_at | now)
 * against a flat transit target. Mirrors `fulfillmentSla` so both boards read the same way.
 *
 * The clock runs from shipment creation to delivery (or "now" while in flight). For a DELIVERED
 * shipment it becomes retrospective — did it beat the promise? — which also feeds the "on-time %"
 * courier view later.
 */
export type SlaState = "within" | "approaching" | "breached";

export interface SlaBadge {
  state: SlaState;
  label: string; // "Within SLA" | "Approaching" | "Breached"
  tone: string; // ok | warn | over — reuses the existing SLA pill tones
  targetHrs: number;
  hoursLeft: number; // negative once breached (how late)
}

/** Domestic transit promise, created → delivered. Conservative for a hand-packed luxury brand.
 *  A single knob today; a per-courier / per-zone table is the post-launch refinement. */
export const SHIPMENT_SLA_HRS = 6 * 24; // 6 days
export const APPROACHING_AT = 0.75;

// Statuses where the SLA clock has stopped (settled) or never applies.
const SETTLED = new Set(["delivered", "rto", "cancelled"]);

/**
 * SLA state for one shipment. `now` is injected for determinism/testability. A delivered shipment is
 * judged on its ACTUAL delivery time (created → delivered_at); an in-flight one on elapsed-so-far.
 * RTO / cancelled are terminal non-deliveries — the board shows a health badge for those, so this
 * still returns a value but the caller may choose not to render it.
 */
export function shipmentSla(createdAtIso: string, status: string, deliveredAtIso: string | null, now: number = Date.now()): SlaBadge {
  const targetHrs = SHIPMENT_SLA_HRS;
  const created = new Date(createdAtIso).getTime();
  const end = status === "delivered" && deliveredAtIso ? new Date(deliveredAtIso).getTime() : now;
  const elapsedHrs = Number.isFinite(created) ? Math.max(0, (end - created) / 3.6e6) : 0;
  const hoursLeft = Math.round((targetHrs - elapsedHrs) * 10) / 10;

  if (elapsedHrs >= targetHrs) return { state: "breached", label: "Breached", tone: "over", targetHrs, hoursLeft };
  if (elapsedHrs >= targetHrs * APPROACHING_AT) return { state: "approaching", label: "Approaching", tone: "warn", targetHrs, hoursLeft };
  return { state: "within", label: "Within SLA", tone: "ok", targetHrs, hoursLeft };
}

/** True when the SLA clock has stopped (delivered/rto/cancelled). */
export function shipmentSettled(status: string): boolean {
  return SETTLED.has(status);
}
