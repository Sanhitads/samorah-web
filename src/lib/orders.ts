/**
 * Order architecture (Phase 3 — types + pure helpers; persistence lands in Beat 2
 * via the Razorpay webhook, the ONLY writer). Everything financial is stored as an
 * IMMUTABLE PAISE SNAPSHOT on payment success — orders/invoices are never
 * recomputed from live config, so a later rename or GST change never alters a past
 * order (each order keeps its own `taxVersion` + promotion snapshots).
 */
import type { OrderTotals, LineBreakdown } from "@/lib/commerce";
import type { AddressForm, BusinessForm } from "@/lib/checkout";
import type { PromotionSnapshot } from "@/lib/promotions";
import { INVOICE, COMMERCE, RESERVATION_TTL_MINUTES } from "@/config/commerce";

// ── Order lifecycle ───────────────────────────────────────────────────────────
export const ORDER_STATUSES = [
  "pending_payment", "paid", "packed", "shipped", "delivered",
  "cancelled", "refund_requested", "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Payment lifecycle — Pending / Failed / Expired are distinct (never lumped). */
export type PaymentStatus =
  | "pending" | "created" | "authorized" | "captured" | "failed" | "expired" | "refunded";

// ── Immutable snapshots (paise) ───────────────────────────────────────────────
export interface OrderLineSnapshot extends LineBreakdown {
  productId: string;
  slug: string;
  variant?: string; // "Glass · 100g"
  vessel?: string;
  size?: string;
  edition?: string; // "NO. I.1" / "VOL. I.1"
  chapter?: string;
  hour?: string; // Air — "09:20"
  imageRef?: string;
  compositionId?: string;
}
export interface OrderTotalsSnapshot extends Omit<OrderTotals, "lines"> {
  currency: string; // "INR"
}

// ── Gift order (fields reserved now; UI later) ────────────────────────────────
export interface GiftFields {
  isGift: boolean;
  giftMessage?: string | null;
  giftRecipientName?: string | null;
  hideInvoice?: boolean; // omit the price-bearing invoice from the parcel
}

// ── Audit timeline — an immutable event log per order (debugging + admin) ──────
export const ORDER_EVENTS = [
  "created", "validated", "payment_started", "webhook_received",
  "invoice_generated", "shipment_created", "delivered", "refunded",
] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];
export interface OrderEventRecord {
  type: OrderEvent;
  at: string; // ISO
  actor?: "customer" | "system" | "webhook" | "admin";
  note?: string;
  meta?: Record<string, unknown>;
}

// ── Stock reservation (15-min hold; the expiry cron releases it) ──────────────
export type ReservationStatus = "active" | "released" | "consumed";
export interface StockReservation {
  id: string;
  orderId: string;
  variantId: string;
  qty: number;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: string; // createdAt + RESERVATION_TTL_MINUTES
}
export const RESERVATION_TTL_MS = RESERVATION_TTL_MINUTES * 60_000;
export function reservationExpiry(createdAtISO: string): string {
  return new Date(new Date(createdAtISO).getTime() + RESERVATION_TTL_MS).toISOString();
}
export function isReservationExpired(r: StockReservation, nowISO: string): boolean {
  return r.status === "active" && new Date(r.expiresAt).getTime() <= new Date(nowISO).getTime();
}
/**
 * Reservation lifecycle (Beat 2 cron `release-expired-reservations`, every ~5 min):
 *   active → (payment success) consumed → stock deducted
 *   active → (TTL elapsed, no payment) released → stock returned
 * On create-order the reservation is written `active` with `expiresAt`; the webhook
 * flips it `consumed`; the cron flips any expired `active` → `released`.
 */

// ── Shipments — an order may have MANY (partial shipment supported) ───────────
export type ShipmentStatus = "created" | "in_transit" | "delivered" | "rto";
export interface ShipmentItem { lineKey: string; qty: number }
export interface Shipment {
  id: string;
  orderId: string;
  courier?: string;
  awb?: string;
  items: ShipmentItem[]; // a subset of the order's lines
  status: ShipmentStatus;
  createdAt: string;
}

// ── Refunds — full or partial ─────────────────────────────────────────────────
export type RefundType = "full" | "partial";
export type RefundStatus = "requested" | "processing" | "processed" | "failed";
export interface Refund {
  id: string;
  orderId: string;
  type: RefundType;
  amount: number; // paise
  reason?: string;
  lines?: ShipmentItem[]; // for partial refunds
  status: RefundStatus;
  createdAt: string;
}

// ── The order record ──────────────────────────────────────────────────────────
export interface OrderRecord {
  id: string;
  orderNumber: string;
  invoiceNumber: string | null; // allocated only on payment success (FY sequence)
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  isGuest: boolean;
  userId?: string | null;
  email: string;
  shippingAddress: AddressForm;
  billingAddress: AddressForm;
  business?: BusinessForm | null; // B2B GST invoice
  orderNotes?: string | null;
  gift: GiftFields;
  lines: OrderLineSnapshot[];
  totals: OrderTotalsSnapshot;
  taxVersion: string; // frozen tax-rule version (config TAX_VERSION at order time)
  promotions: PromotionSnapshot[]; // immutable — why the discount was given
  events: OrderEventRecord[];
  shipments: Shipment[];
  refunds: Refund[];
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  createdAt: string;
  paidAt?: string | null;
}

// ── Invoice numbering (FY; allocated on payment success — Beat 2) ─────────────
/** SAM/26-27/000001 — `seq` from a per-FY Postgres sequence in the webhook txn. */
export function invoiceNumber(seq: number, date: Date): string {
  return INVOICE.format(INVOICE.financialYear(date), seq);
}

// ── Cancellation window ───────────────────────────────────────────────────────
const STATUS_ORDER: OrderStatus[] = ["pending_payment", "paid", "packed", "shipped", "delivered"];
/** A customer may cancel up to (and including) `policy.cancellableUntil`. */
export function canCancel(status: OrderStatus): boolean {
  const until = STATUS_ORDER.indexOf(COMMERCE.policy.cancellableUntil);
  const at = STATUS_ORDER.indexOf(status);
  return at >= 0 && until >= 0 && at <= until;
}

// ── Razorpay retry — reuse an existing order rather than creating duplicates ───
/**
 * On a retry, reuse the SAME Razorpay order while payment is still open (pending /
 * failed) and not expired — never mint a duplicate. A fresh order is created only
 * when none exists or the previous one expired.
 */
export function canReuseRazorpayOrder(
  order: Pick<OrderRecord, "razorpayOrderId" | "paymentStatus">,
): boolean {
  return Boolean(order.razorpayOrderId) && (order.paymentStatus === "pending" || order.paymentStatus === "failed");
}

// ── Server re-price / validation contract (before create-order, Beat 2) ───────
/**
 * NEVER trust the client cart. Before create-order the server re-prices from the
 * catalogue and re-runs promotions with `computeOrderTotals`:
 *  - a composition still has exactly BUNDLE_SIZE lines, all same vessel, all
 *    eligible → else drop the 15% and error;
 *  - re-derived payable matches the client within 0 paise;
 *  - stock is available (→ StockReservation, 15-min hold).
 */
export interface CartValidation {
  ok: boolean;
  reason?: string;
  repricedPayable?: number; // paise
}
