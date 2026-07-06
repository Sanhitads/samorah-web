/**
 * Order architecture (Phase 3 — types only; persistence lands in Beat 2 via the
 * Razorpay webhook, the ONLY writer). Everything financial is stored as an
 * IMMUTABLE SNAPSHOT on payment success — orders/invoices are never recomputed
 * from the live catalogue, so renaming a product or changing GST never alters a
 * past order. Includes gift-order fields (future UI) and the FY invoice format.
 */
import type { OrderTotals, LineBreakdown } from "@/lib/commerce";
import type { AddressForm, BusinessForm } from "@/lib/checkout";
import { INVOICE } from "@/config/commerce";

// ── Lifecycle (architecture supports it; no UI yet) ───────────────────────────
export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "refund_requested",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PaymentStatus = "created" | "authorized" | "captured" | "failed" | "refunded";

// ── Immutable line snapshot (what the customer actually bought) ────────────────
export interface OrderLineSnapshot extends LineBreakdown {
  productId: string;
  slug: string;
  variant?: string; // "Glass · 100g"
  vessel?: string;
  size?: string;
  edition?: string; // "NO. I.1" / "VOL. I.1"
  chapter?: string; // "Vol. I — Dessert Chapter" / "The Hours · The Everyday"
  hour?: string; // Air — "09:20"
  imageRef?: string;
  compositionId?: string;
}

/** Money snapshot — frozen at payment; never recalculated from live config. */
export interface OrderTotalsSnapshot extends Omit<OrderTotals, "lines"> {
  currency: string;
}

// ── Gift order (fields reserved now; UI later) ────────────────────────────────
export interface GiftFields {
  isGift: boolean;
  giftMessage?: string | null;
  giftRecipientName?: string | null;
  hideInvoice?: boolean; // don't include the price-bearing invoice in the parcel
}

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
  billingAddress: AddressForm; // === shipping when "same as" is checked
  business?: BusinessForm | null; // B2B invoice details (GSTIN)
  orderNotes?: string | null;
  gift: GiftFields;
  lines: OrderLineSnapshot[];
  totals: OrderTotalsSnapshot;
  promotionCodes: string[];
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  createdAt: string;
  paidAt?: string | null;
}

// ── Invoice numbering (FY, allocated on payment success — Beat 2) ─────────────
/** SAM/26-27/000001 — `seq` comes from a per-FY Postgres sequence in the webhook. */
export function invoiceNumber(seq: number, date: Date): string {
  return INVOICE.format(INVOICE.financialYear(date), seq);
}

// ── Transactional email events (architecture; templates in Phase 14) ──────────
export const ORDER_EMAILS = [
  "order_confirmation",
  "payment_received",
  "shipment_created",
  "delivered",
  "refund_confirmation",
] as const;
export type OrderEmail = (typeof ORDER_EMAILS)[number];

// ── Server-side validation contract (enforced before create-order, Beat 2) ────
/**
 * NEVER trust the client cart. Before creating a Razorpay order the server must
 * re-price from the catalogue and re-run promotions:
 *  - a composition still has exactly BUNDLE_SIZE lines, all same vessel, all
 *    eligible → else drop the 15% and error;
 *  - re-derived totals match the client's expectation within ₹1;
 *  - stock is available (→ stock_reservations, 15-min hold).
 * `computeOrderTotals` is the shared re-pricing function (client + server).
 */
export interface CartValidation {
  ok: boolean;
  reason?: string;
  repricedTotal?: number;
}
