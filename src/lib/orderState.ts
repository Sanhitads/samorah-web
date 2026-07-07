/**
 * Order state machine — the ALLOWED transitions over the persisted `order_status`
 * enum (public.order_status). Every status change (finalize, admin ops, fulfilment)
 * must go through `assertTransition` so an order can never jump illegally
 * (e.g. pending → delivered) or move out of a terminal state.
 */
export const DB_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "rto",
] as const;
export type DbOrderStatus = (typeof DB_ORDER_STATUSES)[number];

/** Forward-only lifecycle with explicit exits. Terminal states have no successors. */
const TRANSITIONS: Record<DbOrderStatus, DbOrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "packed", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "rto"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
  rto: [],
};

export function isTerminalStatus(s: DbOrderStatus): boolean {
  return TRANSITIONS[s].length === 0;
}

export function canTransition(from: DbOrderStatus, to: DbOrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws on an illegal transition — the single guard every status write uses. */
export function assertTransition(from: DbOrderStatus, to: DbOrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal order transition: ${from} → ${to}`);
  }
}

/** Allowed next states from `from` (for admin UIs). */
export function nextStates(from: DbOrderStatus): DbOrderStatus[] {
  return [...TRANSITIONS[from]];
}
