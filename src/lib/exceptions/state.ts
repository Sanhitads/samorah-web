/**
 * Exception management (§7) — delivery problems are FIRST-CLASS typed states with a
 * resolution workflow, not free-text notes. Attached to a shipment/order.
 */
export const EXCEPTION_TYPES = [
  "delayed",
  "lost",
  "address_incorrect",
  "customer_unavailable",
  "courier_damaged",
  "rejected",
  "returned",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_STATUSES = ["open", "investigating", "resolved", "escalated"] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

const TRANSITIONS: Record<ExceptionStatus, ExceptionStatus[]> = {
  open: ["investigating", "resolved", "escalated"],
  investigating: ["resolved", "escalated"],
  escalated: ["investigating", "resolved"],
  resolved: [],
};

export function canTransitionException(from: ExceptionStatus, to: ExceptionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
export function assertExceptionTransition(from: ExceptionStatus, to: ExceptionStatus): void {
  if (!canTransitionException(from, to)) throw new Error(`Illegal exception transition: ${from} → ${to}`);
}
export function isTerminalException(s: ExceptionStatus): boolean {
  return TRANSITIONS[s].length === 0;
}
export function isValidExceptionType(t: string): t is ExceptionType {
  return (EXCEPTION_TYPES as readonly string[]).includes(t);
}
