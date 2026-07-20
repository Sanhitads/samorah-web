/**
 * Returns engine (§8) — reverse logistics, its OWN module and state machine, kept
 * separate from forward shipping so neither corrupts the other.
 */
export const RETURN_REASONS = ["damaged", "wrong_item", "not_as_described", "changed_mind", "defective"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

// Full return lifecycle (Resolution Center). The path after "approved" is chosen by the admin's
// RESOLUTION (return_required → RMA/pickup; waived/refund/replacement → straight to fulfilment) —
// the state machine allows every valid branch, the UI offers the one the resolution implies.
export const RETURN_STATUSES = [
  "requested",
  "under_review",
  "approved",
  "return_required",
  "in_transit",
  "received",
  "inspection",
  "refund_processing",
  "refunded",
  "replacement_shipped",
  "closed",
  "rejected",
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

const TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  // Resolution branches: physical return needed, or waive → refund / replacement / close.
  approved: ["return_required", "refund_processing", "replacement_shipped", "closed", "rejected"],
  return_required: ["in_transit", "rejected"],
  in_transit: ["received"],
  received: ["inspection"],
  // After inspection: refund, replacement, close (e.g. keep-as-sample), or reject the claim.
  inspection: ["refund_processing", "replacement_shipped", "closed", "rejected"],
  refund_processing: ["refunded"],
  refunded: ["replacement_shipped", "closed"], // "both" = refund then replacement
  replacement_shipped: ["closed"],
  closed: [],
  rejected: [],
};

export function canTransitionReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
export function assertReturnTransition(from: ReturnStatus, to: ReturnStatus): void {
  if (!canTransitionReturn(from, to)) throw new Error(`Illegal return transition: ${from} → ${to}`);
}
export function isTerminalReturn(s: ReturnStatus): boolean {
  return TRANSITIONS[s].length === 0;
}

// Once money/goods have moved or the ticket is settled, the RESOLUTION (and refund method) must not
// change — editing it after the fact is an expensive, audit-breaking mistake. The UI shows a lock and
// disables the setters; the update API enforces the same rule server-side.
const RESOLUTION_LOCKED: ReturnStatus[] = ["refunded", "replacement_shipped", "closed", "rejected"];
export function isResolutionLocked(s: ReturnStatus): boolean {
  return RESOLUTION_LOCKED.includes(s);
}
export function nextReturnStates(from: ReturnStatus): ReturnStatus[] {
  return [...TRANSITIONS[from]];
}
