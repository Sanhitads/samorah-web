/**
 * Cancel + Refund dialog vocabulary (admin Screens 2–3) — pure, testable logic behind the two
 * commercial dialogs. No I/O. The dialogs render what these return; the services enforce it.
 *
 * Design rules baked in here:
 *  · The impact preview shows ONLY effects that actually run today. cancel_order restocks inventory
 *    and releases the reservation; it does NOT release coupons, reverse loyalty points, or void
 *    invoices — so those are labelled "not automated", never claimed as done. A preview that lies to
 *    finance is worse than no preview (the explicit decision on this request).
 *  · Customer-facing text is drawn from a SAFE phrase per sub-reason — the raw internal reason
 *    ("suspected fraud", "serial refunder") must never reach the customer's inbox.
 */

import type { CancellationType } from "@/services/cancellationService";

// ── Cancellation reason taxonomy (review point: reason library) ───────────────
export interface SubReason {
  value: string;
  label: string;
  /** What the CUSTOMER is told. Never the internal phrasing. */
  customerSafe: string;
}
export interface ReasonCategory {
  type: CancellationType; // maps onto the existing cancellation_type enum (back-compat)
  label: string;
  subReasons: SubReason[];
}

export const CANCEL_REASONS: ReasonCategory[] = [
  {
    type: "customer",
    label: "Customer Request",
    subReasons: [
      { value: "changed_mind", label: "Changed mind", customerSafe: "At your request." },
      { value: "ordered_mistake", label: "Ordered by mistake", customerSafe: "At your request." },
      { value: "delivery_delay", label: "Delivery delay", customerSafe: "Due to an expected delivery delay." },
      { value: "duplicate", label: "Duplicate order", customerSafe: "This was a duplicate of another order." },
    ],
  },
  {
    type: "warehouse_exception",
    label: "Warehouse",
    subReasons: [
      { value: "damaged", label: "Damaged product", customerSafe: "The item was found damaged before dispatch." },
      { value: "stock_lost", label: "Stock lost", customerSafe: "The item is no longer available." },
      { value: "qc_failed", label: "QC failed", customerSafe: "The item did not pass our quality check." },
    ],
  },
  {
    type: "fraud",
    label: "Fraud / Risk",
    subReasons: [
      // Customer-safe phrasing NEVER says "fraud" or "chargeback".
      { value: "chargeback_risk", label: "Chargeback risk", customerSafe: "We were unable to verify this order." },
      { value: "suspicious", label: "Suspicious order", customerSafe: "We were unable to verify this order." },
    ],
  },
  {
    type: "admin",
    label: "Admin",
    subReasons: [
      { value: "pricing_error", label: "Pricing error", customerSafe: "Due to a pricing error on our side." },
      { value: "internal", label: "Internal issue", customerSafe: "Due to an internal issue on our side." },
    ],
  },
];

/** Resolve the customer-safe phrase for a (category, subReason). Falls back to a neutral line so a
 *  customer email can never accidentally carry an internal note. */
export function customerSafePhrase(type: CancellationType, subReasonValue: string | null | undefined): string {
  const cat = CANCEL_REASONS.find((c) => c.type === type);
  const sub = cat?.subReasons.find((s) => s.value === subReasonValue);
  return sub?.customerSafe ?? "Your order has been cancelled.";
}

// ── High-value confirmation guard (review point: type CANCEL) ─────────────────
/** Cancellations at/above this value require typing CANCEL — a deliberate speed bump on the orders
 *  most expensive to get wrong. */
export const CANCEL_CONFIRM_THRESHOLD = 10_000;
export function requiresTypedConfirm(total: number): boolean {
  return total >= CANCEL_CONFIRM_THRESHOLD;
}

// ── Operational impact preview (review point: impact) ─────────────────────────
export interface CancelImpactInput {
  units: number; // total item quantity on the order
  releaseInventory: boolean;
  paymentPaid: boolean; // money was actually captured
  issueRefund: boolean;
  refundAmount: number;
  gateway: boolean; // refund would go to the gateway vs a manual settlement
  couponCode: string | null;
  loyaltyPoints: number; // loyalty_points_earned on the order
  hasInvoice: boolean; // a tax invoice was allocated
}
export interface ImpactRow {
  label: string;
  value: string;
  tone: "ok" | "warn" | "muted";
  /** false → this consequence is NOT automated; the operator must handle it by hand. */
  automated: boolean;
}
/**
 * The honest consequences of confirming this cancellation. `ok` rows are things the system really
 * does; `warn` rows flag money left on the table or a manual step the code does NOT perform. Nothing
 * here is aspirational — every automated:true row corresponds to real code in cancel_order / the
 * refund service.
 */
export function cancelImpact(i: CancelImpactInput): ImpactRow[] {
  const rows: ImpactRow[] = [];

  // Inventory — real: cancel_order restocks only when release is chosen AND money was captured
  // (an unpaid/pending order never decremented stock, so there's nothing to give back).
  if (i.releaseInventory && i.paymentPaid) {
    rows.push({ label: "Inventory", value: `+${i.units} unit${i.units === 1 ? "" : "s"} restocked`, tone: "ok", automated: true });
  } else {
    rows.push({ label: "Inventory", value: i.releaseInventory ? "nothing to restock (unpaid)" : "not restocked", tone: "muted", automated: true });
  }

  // Reservation — real: always released by cancel_order.
  rows.push({ label: "Reservation", value: "released", tone: "ok", automated: true });

  // Refund — real: only when explicitly chosen; otherwise money stays captured.
  if (i.paymentPaid) {
    if (i.issueRefund && i.refundAmount > 0) {
      rows.push({ label: "Refund", value: `₹${i.refundAmount.toFixed(2)} → ${i.gateway ? "original payment" : "manual settlement"}`, tone: "ok", automated: true });
    } else {
      rows.push({ label: "Refund", value: "none — money stays captured", tone: "warn", automated: true });
    }
  }

  // NOT automated — labelled honestly so no one believes these happen on their own.
  if (i.couponCode) rows.push({ label: "Coupon", value: `${i.couponCode} — not auto-released`, tone: "warn", automated: false });
  if (i.loyaltyPoints > 0) rows.push({ label: "Loyalty", value: `${i.loyaltyPoints} pts — not auto-reversed`, tone: "warn", automated: false });
  if (i.hasInvoice) rows.push({ label: "Invoice", value: "stays live — void manually", tone: "warn", automated: false });

  return rows;
}

// ── Refund type presets (review point: refund type) ───────────────────────────
export type RefundType = "full" | "partial" | "shipping";
export const REFUND_TYPES: { key: RefundType; label: string }[] = [
  { key: "full", label: "Full" },
  { key: "partial", label: "Partial" },
  { key: "shipping", label: "Shipping only" },
];

export interface RefundBreakdown {
  products: number; // goods portion (subtotal − discount)
  shipping: number;
  tax: number;
  total: number;
  alreadyRefunded: number;
  remaining: number;
}

/**
 * The amount a refund TYPE resolves to, always clamped to what's actually left. Full = remaining;
 * Shipping = the shipping line (never more than remaining); Partial = the operator's figure, clamped
 * to [0, remaining]. The clamp is the client mirror of the DB over-refund guard — the ledger stays
 * the final authority, this just stops the UI proposing an impossible number.
 */
export function refundAmountForType(type: RefundType, b: RefundBreakdown, partial: number): number {
  const clamp = (n: number) => Math.min(Math.max(0, Number.isFinite(n) ? n : 0), b.remaining);
  switch (type) {
    case "full": return b.remaining;
    case "shipping": return clamp(b.shipping);
    case "partial": return clamp(partial);
  }
}

// ── Customer notification channels (review point: notify) ─────────────────────
/**
 * Channels the operator can pick. `live` is the honest truth about what actually delivers today:
 * email is wired; customer SMS/WhatsApp are structure-only (no customer template / no WhatsApp
 * number yet), so the UI records the choice but shows them as pending rather than pretending to send.
 */
export const NOTIFY_CHANNELS = [
  { key: "email", label: "Email", live: true },
  { key: "sms", label: "SMS", live: false },
  { key: "whatsapp", label: "WhatsApp", live: false },
] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number]["key"];

// ── Shared per-order context (from the context endpoint) ──────────────────────
/** The read-only per-order context both dialogs fetch on open (money breakdown, items, refund
 *  history, timeline). Shared so the endpoint and the components can't drift. */
export interface OrderContext {
  ok: boolean;
  order: {
    orderNumber: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string | null;
    hasPayment: boolean;
    paid: boolean;
    gateway: boolean;
    total: number;
    refundAmount: number;
    remaining: number;
    subtotal: number;
    discount: number;
    products: number;
    shipping: number;
    tax: number;
    couponCode: string | null;
    loyaltyPoints: number;
    hasInvoice: boolean;
    units: number;
    itemCount: number;
  };
  items: { name: string; variant: string | null; qty: number }[];
  refunds: { amount: number; method: string; status: string; reason: string | null; refundId: string | null; createdAt: string }[];
  timeline: { event: string; at: string; actorType: string; notes: string | null; prev: string | null; next: string | null }[];
}
