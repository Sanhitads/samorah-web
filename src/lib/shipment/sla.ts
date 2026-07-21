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

/**
 * Expected delivery date + days remaining (review priority 1.2 — actionable ETA instead of only a
 * "Within SLA" pill). Derived from the same created + transit-target clock as the SLA badge, so the
 * two never disagree. `daysRemaining` goes negative once overdue (how many days late).
 */
export function shipmentEta(createdAtIso: string, targetHrs: number = SHIPMENT_SLA_HRS, now: number = Date.now()): { dateMs: number; daysRemaining: number } {
  const created = new Date(createdAtIso).getTime();
  const dateMs = (Number.isFinite(created) ? created : now) + targetHrs * 3.6e6;
  return { dateMs, daysRemaining: Math.round(((dateMs - now) / 86_400_000) * 10) / 10 };
}

/** Age of a shipment in whole days (review priority 1.4 — "4 days old", the way warehouse staff think). */
export function shipmentAgeDays(createdAtIso: string, now: number = Date.now()): number {
  const created = new Date(createdAtIso).getTime();
  return Number.isFinite(created) ? Math.max(0, Math.floor((now - created) / 86_400_000)) : 0;
}

/**
 * "No movement" signal (review priority 1.3). Days since the last tracking update; `stalled` once a
 * live parcel has sat 48h+ without a courier scan. Terminal shipments never stall.
 */
export function shipmentMovement(lastUpdateIso: string | null, status: string, now: number = Date.now()): { days: number | null; stalled: boolean } {
  if (!lastUpdateIso || SETTLED.has(status)) return { days: null, stalled: false };
  const last = new Date(lastUpdateIso).getTime();
  if (!Number.isFinite(last)) return { days: null, stalled: false };
  const days = Math.floor((now - last) / 86_400_000);
  return { days, stalled: now - last >= 48 * 3.6e6 };
}
