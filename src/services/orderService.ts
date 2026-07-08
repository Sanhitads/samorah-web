/**
 * Order persistence (Stage 2B) — the server is the ONLY writer of orders.
 *
 *  createPendingOrder()  — at create-order time, writes a server-priced pending
 *                          order (+ items) keyed by razorpay_order_id.
 *  persistOrder()        — the ONE idempotent finalizer, called identically by
 *                          BOTH /verify and the webhook. First caller finalizes
 *                          (payment paid + gapless FY invoice); any later caller
 *                          returns the existing order with no side effects.
 *
 * All money is derived from the server re-price (RepriceResult), never the client.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { callRpc } from "@/lib/supabase/rpc";
import { toRupees } from "@/lib/money";
import { COMMERCE } from "@/config/commerce";
import { validateRazorpayPayment } from "@/lib/razorpayApi";
import { signOrderToken } from "@/lib/orderToken";
import type { RepriceResult } from "@/lib/repricing";

export interface OrderAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

const r2 = (paise: number) => Number(toRupees(paise).toFixed(2));

/**
 * Build the pending-order payload from the SERVER re-price. Line taxes are split
 * CGST/SGST (intra) or IGST (inter) per line; the header carries the authoritative
 * engine totals. Returns null if the reprice is invalid.
 */
/** Reserve stock atomically before payment. Returns ok:false with the offending
 *  SKU when an item just sold out (concurrent buyer) — the caller stops payment. */
export async function reserveStock(input: {
  sessionId: string;
  ttlMinutes?: number;
  items: { variantId: string; quantity: number; sku: string }[];
}): Promise<{ ok: boolean; sku?: string; reason?: string }> {
  if (!input.items.length) return { ok: true };
  return callRpc<{ ok: boolean; sku?: string; reason?: string }>("reserve_stock", {
    p: {
      session_id: input.sessionId,
      ttl_minutes: input.ttlMinutes ?? 15,
      items: input.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity, sku: i.sku })),
    },
  });
}

/** Cron: free holds never linked to an order. Returns count released. */
export async function releaseExpiredReservations(): Promise<number> {
  return callRpc<number>("release_expired_reservations", {});
}

/** Cron: cancel unpaid pending orders older than `minutes` + free their holds. */
export async function expireStalePendingOrders(minutes = 30): Promise<number> {
  return callRpc<number>("expire_stale_pending_orders", { p_minutes: minutes });
}

/** Queue post-commit side-effects. Idempotent — safe to call from verify + webhook. */
async function enqueueFulfillment(orderId: string): Promise<void> {
  try {
    await callRpc<void>("queue_fulfillment_job", { p_order_id: orderId, p_job_type: "email" });
    // Provider-agnostic: the shipping engine picks the courier (Manual today).
    await callRpc<void>("queue_fulfillment_job", { p_order_id: orderId, p_job_type: "shipping" });
  } catch (e) {
    console.error("enqueueFulfillment failed", e); // externals never block the response
  }
}

export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

export function buildPendingPayload(
  reprice: RepriceResult,
  ctx: {
    email: string;
    address: OrderAddress;
    couponCode?: string;
    notes?: string;
    razorpayOrderId: string;
    cartHash?: string;
    reservationSession?: string;
    utm?: UtmParams;
  },
): Record<string, unknown> | null {
  const t = reprice.totals;
  if (!reprice.valid || !t) return null;
  const inter = t.interState;
  // compositionId lives on the engine lines (not the tax breakdown) — map by key.
  const compById = new Map(reprice.lines.map((l) => [l.key, l.compositionId]));

  const items = t.lines.map((l) => {
    const d = reprice.details[l.key] ?? { sku: l.key };
    const cgst = inter ? 0 : Math.round(l.gst / 2);
    const sgst = inter ? 0 : l.gst - cgst;
    const igst = inter ? l.gst : 0;
    return {
      product_id: d.productId ?? "",
      variant_id: d.variantId ?? "",
      product_name: l.name,
      variant_name: d.variantName ?? "",
      sku: d.sku,
      hsn_code: l.hsn,
      gst_rate: l.gstRate,
      unit_price: r2(l.unitPrice),
      quantity: l.qty,
      line_subtotal: r2(l.lineTotal),
      line_discount: r2(l.discount),
      line_taxable: r2(l.taxableValue),
      line_cgst: r2(cgst),
      line_sgst: r2(sgst),
      line_igst: r2(igst),
      line_total: r2(l.netInclusive),
      // immutable presentation/catalogue snapshot
      brand_name: d.brandName ?? "",
      collection_name: d.collectionName ?? "",
      volume_label: d.volumeLabel ?? "",
      edition_label: d.editionLabel ?? "",
      vessel: d.vessel ?? "",
      size: d.size ?? "",
      product_slug: d.productSlug ?? "",
      image_url: d.imageUrl ?? "",
      composition_id: compById.get(l.key) ?? "",
    };
  });

  return {
    email: ctx.email,
    phone: ctx.address.phone,
    coupon_code: ctx.couponCode ?? "",
    subtotal: r2(t.subtotal),
    discount_amount: r2(t.discount),
    shipping_amount: r2(t.shipping),
    total_amount: r2(t.payable),
    taxable_amount: r2(t.taxableValue),
    cgst_amount: r2(t.cgst),
    sgst_amount: r2(t.sgst),
    igst_amount: r2(t.igst),
    ship_full_name: ctx.address.fullName,
    ship_phone: ctx.address.phone,
    ship_line1: ctx.address.line1,
    ship_line2: ctx.address.line2 ?? "",
    ship_city: ctx.address.city,
    ship_state: ctx.address.state,
    ship_pincode: ctx.address.pincode,
    internal_notes: ctx.notes ?? "",
    razorpay_order_id: ctx.razorpayOrderId,
    // version + shipping snapshot (order is self-describing)
    brand_name: COMMERCE.brandName,
    commerce_version: t.commerceVersion,
    tax_version: t.taxVersion,
    pricing_version: t.pricingVersion,
    shipping_method: t.freeShipping ? "free" : "standard",
    shipping_charge: r2(t.shipping),
    shipping_gst: r2(t.shippingGst),
    shipping_rate_version: t.pricingVersion,
    cart_hash: ctx.cartHash ?? "",
    reservation_session: ctx.reservationSession ?? "",
    utm_source: ctx.utm?.source ?? "",
    utm_medium: ctx.utm?.medium ?? "",
    utm_campaign: ctx.utm?.campaign ?? "",
    utm_content: ctx.utm?.content ?? "",
    utm_term: ctx.utm?.term ?? "",
    items,
  };
}

export interface PendingOrderResult {
  orderId: string;
  orderNumber: string;
}

/** Write the pending order (+ items) atomically; returns its number. */
export async function createPendingOrder(payload: Record<string, unknown>): Promise<PendingOrderResult> {
  const data = await callRpc<{ order_id: string; order_number: string }>("create_pending_order", { p: payload });
  return { orderId: data.order_id, orderNumber: data.order_number };
}

export interface FinalizeResult {
  found: boolean;
  created: boolean;
  mismatch?: boolean; // amount/currency/order-id validation failed → not finalized
  reason?: string;
  orderId?: string;
  orderNumber?: string;
  invoiceNumber?: string | null;
  email?: string;
  token?: string; // capability token for the Thank-You page
  source?: string;
}

/** Append a payment attempt to the immutable history (dedup on payment id). */
export async function recordPaymentAttempt(a: {
  razorpayOrderId: string;
  paymentId?: string;
  status: "attempted" | "failed" | "cancelled" | "paid";
  amount?: number;
  currency?: string;
  errorCode?: string;
  errorDescription?: string;
  source: "verify" | "webhook";
}): Promise<void> {
  try {
    await callRpc<void>("record_payment_attempt", {
      p: {
        razorpay_order_id: a.razorpayOrderId,
        razorpay_payment_id: a.paymentId ?? "",
        status: a.status,
        amount: a.amount != null ? String(a.amount) : "",
        currency: a.currency ?? "",
        error_code: a.errorCode ?? "",
        error_description: a.errorDescription ?? "",
        source: a.source,
      },
    });
  } catch (e) {
    console.error("recordPaymentAttempt failed", e); // never block finalization on the log
  }
}

/**
 * persistOrder — THE idempotent finalizer. Both /verify and the webhook call this
 * with the same razorpay order id. Validates the payment (order id, currency,
 * status, amount) BEFORE finalizing; the DB function serialises on the order row
 * and allocates the invoice only for the first caller.
 */
export async function persistOrder(input: {
  razorpayOrderId: string;
  paymentId: string;
  signature: string;
  source: "verify" | "webhook";
}): Promise<FinalizeResult> {
  // 1) Never trust the callback blindly — validate the payment with our keys.
  const check = await validateRazorpayPayment(input.razorpayOrderId, input.paymentId);
  if (check.status === "mismatch") {
    await recordPaymentAttempt({
      razorpayOrderId: input.razorpayOrderId,
      paymentId: input.paymentId,
      status: "failed",
      source: input.source,
      errorDescription: check.reason,
    });
    return { found: true, created: false, mismatch: true, reason: check.reason };
  }

  // 2) Finalize (idempotent). The amount guard runs in-txn against the persisted total.
  const data = await callRpc<{
    found: boolean;
    created?: boolean;
    amount_mismatch?: boolean;
    order_id?: string;
    order_number?: string;
    invoice_number?: string | null;
    email?: string;
    source?: string;
  }>("finalize_order", {
    p_razorpay_order_id: input.razorpayOrderId,
    p_payment_id: input.paymentId,
    p_signature: input.signature,
    p_source: input.source,
    p_amount_paise: check.amountPaise ?? null,
  });

  if (data.amount_mismatch) {
    await recordPaymentAttempt({
      razorpayOrderId: input.razorpayOrderId,
      paymentId: input.paymentId,
      status: "failed",
      source: input.source,
      errorDescription: "amount mismatch",
    });
    return { found: true, created: false, mismatch: true, reason: "amount mismatch", orderNumber: data.order_number };
  }

  if (data.found) {
    await recordPaymentAttempt({
      razorpayOrderId: input.razorpayOrderId,
      paymentId: input.paymentId,
      status: "paid",
      amount: check.amountPaise != null ? Number(toRupees(check.amountPaise).toFixed(2)) : undefined,
      currency: COMMERCE.currency,
      source: input.source,
    });
  }

  // Post-commit side-effects (first finalizer only). Stock was consumed inside
  // finalize_order; these are informational/queued and never block the response.
  if (data.created && data.order_id) {
    // Record the actual payment method (upi/card/netbanking) for the invoice.
    if (check.method) {
      try {
        const db = createAdminClient();
        await db.from("orders").update({ payment_method: check.method }).eq("id", data.order_id);
      } catch (e) {
        console.error("payment_method update failed", e);
      }
    }
    await enqueueFulfillment(data.order_id);
  }

  return {
    found: data.found,
    created: Boolean(data.created),
    orderId: data.order_id,
    orderNumber: data.order_number,
    invoiceNumber: data.invoice_number ?? null,
    email: data.email,
    token: data.order_number ? signOrderToken(data.order_number) : undefined,
    source: data.source,
  };
}

/** Read a finalized order for the Thank-You page. Access is gated by the signed
 *  token at the page layer — this fetch is by order number only. */
export async function getOrderByNumber(orderNumber: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select("*, order_items(*)")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Read a finalized order by id (fulfillment worker). */
export async function getOrderById(orderId: string) {
  const db = createAdminClient();
  const { data, error } = await db.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle();
  if (error) throw error;
  return data;
}

// ── Fulfillment worker ────────────────────────────────────────────────────────
export async function claimFulfillmentJobs(
  jobType: "email" | "shipping",
  limit = 10,
): Promise<{ id: string; orderId: string; attempts: number }[]> {
  const rows = await callRpc<{ id: string; order_id: string; attempts: number }[]>("claim_fulfillment_jobs", {
    p_job_type: jobType,
    p_limit: limit,
  });
  return (rows ?? []).map((r) => ({ id: r.id, orderId: r.order_id, attempts: r.attempts }));
}

export async function completeFulfillmentJob(
  id: string,
  status: "done" | "failed" | "queued",
  error?: string,
): Promise<void> {
  await callRpc<void>("complete_fulfillment_job", { p_id: id, p_status: status, p_error: error ?? "" });
}
