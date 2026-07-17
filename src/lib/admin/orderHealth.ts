/**
 * Order Health (admin Phase 3) — a single operational indicator per order, computed AUTOMATICALLY
 * from existing system state. Never stored, never manually edited: it is a pure projection of
 * signals that already live in the schema (incident link, refund ledger, NDR/hold state, payment
 * state, fraud-review flag). Same discipline as `lib/fulfillment/derive.ts` — the reader gathers the
 * inputs, this decides the state, the UI renders it.
 *
 * Precedence matters when several signals fire at once: the MOST operationally blocking wins, so an
 * order that is both delayed and under fraud review reads as Fraud Review (the thing that must be
 * resolved before anything ships). Order of the switch below IS the precedence.
 */

export type HealthState = "fraud" | "incident" | "refund_pending" | "delayed" | "attention" | "healthy";

export interface HealthInput {
  status: string; // order_status
  paymentStatus: string; // payment_status
  /** fraud_review state (Phase 2 column). Optional so Health works BEFORE that migration lands —
   *  undefined/null/"cleared" simply never raise the fraud state. */
  fraudReview?: string | null;
  hasOpenIncident: boolean; // an open incident references this order (existing soft relationship)
  refundPending: boolean; // a refund is initiated/processing (not yet settled)
  ndrStatus?: string | null; // delivery_failed | re_attempt_scheduled | rto
  fulfillmentStatus?: string | null; // e.g. on_hold
  shipmentException?: boolean; // shipment flagged delayed/lost/damaged
}

export interface HealthBadge {
  state: HealthState;
  label: string;
  dot: string; // emoji indicator
  tone: string; // maps to an existing colour token via data-attr
  reason: string; // one-line WHY, for a tooltip / detail line
}

/** A fraud-review state only flags health while it's ACTIVE — a cleared review is not a concern. */
function fraudActive(v: string | null | undefined): boolean {
  return !!v && v !== "cleared";
}

const META: Record<HealthState, Omit<HealthBadge, "reason">> = {
  fraud: { state: "fraud", label: "Fraud Review", dot: "⚫", tone: "fraud" },
  incident: { state: "incident", label: "Incident", dot: "🔴", tone: "incident" },
  refund_pending: { state: "refund_pending", label: "Refund Pending", dot: "🔵", tone: "refund" },
  delayed: { state: "delayed", label: "Delayed", dot: "🟠", tone: "delayed" },
  attention: { state: "attention", label: "Needs Attention", dot: "🟡", tone: "attention" },
  healthy: { state: "healthy", label: "Healthy", dot: "🟢", tone: "healthy" },
};

export function orderHealth(i: HealthInput): HealthBadge {
  const at = (state: HealthState, reason: string): HealthBadge => ({ ...META[state], reason });

  // ⚫ Fraud review — most blocking: nothing should proceed until it's resolved.
  if (fraudActive(i.fraudReview)) return at("fraud", `Fraud review: ${i.fraudReview}`);

  // 🔴 Incident — a systemic issue is touching this order.
  if (i.hasOpenIncident) return at("incident", "Attached to an open incident");

  // 🔵 Refund pending — money movement in flight.
  if (i.refundPending) return at("refund_pending", "A refund is processing");

  // 🟠 Delayed — delivery failed / RTO / on hold / shipment exception.
  if (i.ndrStatus === "delivery_failed" || i.ndrStatus === "rto") return at("delayed", `Delivery ${i.ndrStatus === "rto" ? "returned to origin" : "failed"}`);
  if (i.fulfillmentStatus === "on_hold") return at("delayed", "Fulfilment on hold");
  if (i.shipmentException) return at("delayed", "Shipment exception");

  // 🟡 Needs attention — softer issues that aren't yet blocking.
  if (i.paymentStatus === "failed") return at("attention", "Payment failed");
  if (i.ndrStatus === "re_attempt_scheduled") return at("attention", "Re-delivery scheduled");

  // 🟢 Healthy — nothing needs a human right now.
  return at("healthy", "No action needed");
}

/** All states, most-severe first — for the Health filter dropdown + legend. */
export const HEALTH_ORDER: HealthState[] = ["fraud", "incident", "refund_pending", "delayed", "attention", "healthy"];
export const HEALTH_META = META;
