import { NextResponse } from "next/server";
import { RAZORPAY } from "@/config/commerce";
import { verifyWebhookSignature } from "@/lib/razorpaySignature";
import { persistOrder, recordPaymentAttempt } from "@/services/orderService";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOps } from "@/lib/notifications/opsEngine";
import { HIGH_VALUE_ORDER_INR } from "@/config/notifications";

/** Operational Slack/dashboard alert on a finalized order (best-effort; never blocks the webhook).
 *  High-value orders route as their own event so ops can watch them in #orders. */
async function emitOrderPlaced(razorpayOrderId: string): Promise<void> {
  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: o } = await db.from("orders").select("order_number,ship_full_name,email,total_amount,payment_status,is_cod").eq("razorpay_order_id", razorpayOrderId).maybeSingle();
  if (!o) return;
  const amount = Number(o.total_amount ?? 0);
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const highValue = amount >= HIGH_VALUE_ORDER_INR;
  await notifyOps(highValue ? "order.high_value" : "order.placed", {
    title: highValue ? "High-Value Order" : "New Order",
    fields: [
      { label: "Order", value: o.order_number ?? "—" },
      { label: "Customer", value: o.ship_full_name ?? o.email ?? "—" },
      { label: "Amount", value: `₹${amount.toLocaleString("en-IN")}` },
      { label: "Payment", value: o.is_cod ? "COD" : (o.payment_status ?? "captured") },
    ],
    url: base && o.order_number ? `${base}/admin/orders/${o.order_number}` : undefined,
    entityType: "order", entityRef: o.order_number ?? undefined,
  });
}

/**
 * POST /api/razorpay/webhook — the AUTHORITATIVE payment event from Razorpay and
 * the backstop when the browser closes before /verify. Verifies the signature over
 * the RAW body, then calls the SAME idempotent persistOrder(). A replayed webhook
 * (Razorpay retries) is a safe no-op because the finalizer is idempotent on the
 * order's idempotency_key. Every event is recorded in webhook_logs.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const raw = await request.text(); // raw bytes — signature is computed over these
  const signature = request.headers.get("x-razorpay-signature");

  if (!RAZORPAY.webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }
  const verified = verifyWebhookSignature(raw, signature);

  let event: {
    event?: string;
    account_id?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; error_code?: string; error_description?: string } } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    event = {};
  }

  const db = createAdminClient();
  const eventType = event.event ?? "unknown";
  const payment = event.payload?.payment?.entity;
  const eventId = payment?.id ?? null;

  // Record the event (audit + replay visibility). We store only the JSON body and
  // the verified flag — NEVER the signature header or any secret.
  const { data: log } = await db
    .from("webhook_logs")
    .insert({ provider: "razorpay", event_type: eventType, event_id: eventId, payload: event as never, status: "received", verified } as never)
    .select("id")
    .maybeSingle();
  const logId = (log as { id?: string } | null)?.id;

  const markLog = async (status: "processed" | "failed" | "duplicate", error?: string) => {
    if (!logId) return;
    await db
      .from("webhook_logs")
      .update({ status, error_message: error ?? null, processed_at: new Date().toISOString(), processing_ms: Date.now() - startedAt } as never)
      .eq("id", logId);
  };

  // Invalid signature → log it (verified=false) for audit, then reject.
  if (!verified) {
    await markLog("failed", "invalid signature");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Merchant guard — when a merchant/account id is configured, reject events that
  // aren't for our account (defence-in-depth against cross-account delivery).
  if (RAZORPAY.accountId && event.account_id && event.account_id !== RAZORPAY.accountId) {
    await markLog("failed", "merchant mismatch");
    return NextResponse.json({ error: "Account mismatch." }, { status: 400 });
  }

  // Record failed payments as attempts (retry history) without finalizing.
  if (eventType === "payment.failed") {
    if (payment?.order_id) {
      await recordPaymentAttempt({
        razorpayOrderId: payment.order_id,
        paymentId: payment.id,
        status: "failed",
        source: "webhook",
        errorCode: payment.error_code,
        errorDescription: payment.error_description,
      });
    }
    await markLog("processed");
    return NextResponse.json({ received: true });
  }

  // We finalize on payment capture. Other events are logged and acknowledged.
  if (eventType !== "payment.captured" && eventType !== "order.paid") {
    await markLog("processed"); // acknowledged; no order action
    return NextResponse.json({ received: true });
  }

  const orderId = payment?.order_id;
  const paymentId = payment?.id;
  if (!orderId || !paymentId) {
    await markLog("failed", "missing order_id/payment_id");
    return NextResponse.json({ received: true }); // ack; nothing to finalize
  }

  try {
    const result = await persistOrder({ razorpayOrderId: orderId, paymentId, signature: "", source: "webhook" });
    if (logId && result.found) {
      // Link the log to the order for traceability (best-effort).
      const { data: ord } = await db.from("orders").select("id").eq("razorpay_order_id", orderId).maybeSingle();
      if (ord?.id) await db.from("webhook_logs").update({ order_id: ord.id }).eq("id", logId);
    }
    if (result.mismatch) {
      await markLog("failed", result.reason ?? "amount/currency mismatch");
      // A mismatch means money moved but the order can't be trusted — ops must look NOW.
      await emitOrderFailed(orderId, result.reason ?? "amount/currency mismatch").catch(() => { /* never break the webhook */ });
      return NextResponse.json({ received: true }); // ack; flagged for review, don't retry
    }
    // created=false on a found order → replay of an already-finalized order.
    await markLog(!result.found ? "failed" : result.created ? "processed" : "duplicate", result.found ? undefined : "pending order not found");
    if (result.created) await emitOrderPlaced(orderId).catch(() => { /* alerting must never break the webhook */ });
    return NextResponse.json({ received: true, created: result.created });
  } catch (e) {
    console.error("webhook persistOrder failed", e);
    await markLog("failed", e instanceof Error ? e.message : "unknown");
    // The webhook is the source of truth for orders — a throw here means an order may not exist
    // despite a captured payment. Alert #tech (best-effort; the 500 must still reach Razorpay).
    await emitWebhookFailed(eventType, orderId, e instanceof Error ? e.message : "unknown").catch(() => { /* never break the webhook */ });
    // 500 → Razorpay retries; persistOrder is idempotent, so retries are safe.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

/** Order finalization failed despite a captured payment — money moved, the order didn't. */
async function emitOrderFailed(razorpayOrderId: string, reason: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  await notifyOps("order.failed", {
    title: "Order Failed After Payment",
    message: "A payment was captured but the order could not be finalized — needs review now.",
    fields: [{ label: "Razorpay order", value: razorpayOrderId }, { label: "Reason", value: reason }],
    url: base ? `${base}/admin/orders` : undefined,
    entityType: "order", entityRef: razorpayOrderId,
  });
}

/** Webhook processing threw — the authoritative path is broken. */
async function emitWebhookFailed(eventType: string, razorpayOrderId: string | undefined, reason: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  await notifyOps("webhook.failed", {
    title: "Razorpay Webhook Failed",
    message: "Webhook processing threw — Razorpay will retry, but the order may be unfinalized.",
    fields: [{ label: "Event", value: eventType }, { label: "Razorpay order", value: razorpayOrderId ?? "—" }, { label: "Error", value: reason }],
    url: base ? `${base}/admin/webhooks` : undefined,
    entityType: "webhook", entityRef: razorpayOrderId ?? eventType,
  });
}
