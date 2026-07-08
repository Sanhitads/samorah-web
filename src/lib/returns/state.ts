/**
 * Returns engine (§8) — reverse logistics, its OWN module and state machine, kept
 * separate from forward shipping so neither corrupts the other.
 */
export const RETURN_REASONS = ["damaged", "wrong_item", "not_as_described", "changed_mind", "defective"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_STATUSES = [
  "requested",
  "approved",
  "pickup_scheduled",
  "received",
  "qc",
  "refund",
  "closed",
  "rejected",
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

const TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["pickup_scheduled", "rejected"],
  pickup_scheduled: ["received", "rejected"],
  received: ["qc"],
  qc: ["refund", "rejected"],
  refund: ["closed"],
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
export function nextReturnStates(from: ReturnStatus): ReturnStatus[] {
  return [...TRANSITIONS[from]];
}
