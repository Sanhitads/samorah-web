/**
 * Refund service — the money side of Order Management (SLP principle 8).
 *
 * A refund is a THREE-step dance so a gateway hiccup can never corrupt the order:
 *   1. begin_refund  — reserve the amount in the `refunds` ledger with an
 *      over-refund guard (DB-side, under a row lock).
 *   2. createRazorpayRefund — call the gateway. If Razorpay isn't configured or
 *      the order was paid out-of-band (COD/manual), we fall back to a `manual`
 *      refund the finance team settles outside the app.
 *   3. settle_refund — write the gateway outcome back and recompute the order's
 *      refund_amount + payment_status from processed rows only (ledger = truth).
 *
 * Cancel ≠ refund: cancelling an order never refunds automatically. This is only
 * invoked when a human explicitly asks to return money.
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayRefund } from "@/lib/razorpayApi";
import { logEvent } from "@/services/auditService";
import { toPaise } from "@/lib/money";
import { RAZORPAY } from "@/config/commerce";
import { trackServerRefund } from "@/lib/analytics/server";
import { notifyOps } from "@/lib/notifications/opsEngine";

export interface IssueRefundInput {
  orderId: string;
  amount: number; // rupees; the amount to refund (defaults to full remaining if omitted upstream)
  reason?: string; // customer-facing reason (stored in the ledger)
  internalNote?: string; // internal finance note — audit metadata only, never customer-facing
  refundType?: string; // full | partial | shipping (for analytics)
  actorId?: string;
  paymentId?: string | null; // razorpay_payment_id; null → manual refund
  latePayment?: boolean; // compensating a real gateway capture on an order we already cancelled (1B-0a)
}

export interface IssueRefundResult {
  ok: boolean;
  refundId?: string;
  status?: "processing" | "processed" | "failed";
  method?: "gateway" | "manual";
  reason?: string; // failure reason when ok=false
}

/**
 * Recover a FAILED late-payment compensation obligation for an order our system marked failed/cancelled.
 * Anchored on the obligation itself (the refunds ledger is refund-truth): a `failed` refund carrying a
 * `razorpay_payment_id` on a non-paid order can ONLY exist via late_payment mode (begin_refund's not_paid
 * guard blocks every normal refund on a non-paid order), so it IS a late-payment obligation. We additionally
 * cross-check that payment id against the canonical captured `payment_attempts` record for the SAME order
 * (matched by razorpay_order_id). Returns the obligation's ORIGINAL amount + original payment id — never
 * recomputed, never an arbitrary captured payment. null if there is no verified recoverable obligation.
 */
export async function findRecoverableLatePaymentRefund(orderId: string, razorpayOrderId: string | null): Promise<{ amount: number; paymentId: string } | null> {
  if (!razorpayOrderId) return null;
  const db = createAdminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: obligations } = await db.from("refunds")
    .select("amount, razorpay_payment_id, status, created_at")
    .eq("order_id", orderId).eq("status", "failed").not("razorpay_payment_id", "is", null)
    .order("created_at", { ascending: false }).limit(1);
  const ob = (obligations ?? [])[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!ob?.razorpay_payment_id) return null;
  const { data: caps } = await db.from("payment_attempts")
    .select("id").eq("razorpay_order_id", razorpayOrderId).eq("razorpay_payment_id", ob.razorpay_payment_id).eq("status", "paid").limit(1);
  if (!((caps ?? []).length)) return null; // no verified capture for this payment on this order
  return { amount: Number(ob.amount), paymentId: ob.razorpay_payment_id as string };
}

export async function issueRefund(input: IssueRefundInput): Promise<IssueRefundResult> {
  // A gateway refund needs both a configured account AND a payment id; otherwise
  // it's a manual refund (recorded, settled by finance out-of-band).
  const isGateway = Boolean(RAZORPAY.configured && input.paymentId);
  const method: "gateway" | "manual" = isGateway ? "gateway" : "manual";

  // 1. Reserve the slot (over-refund guarded in the DB).
  const begin = await callRpc<{ ok: boolean; refund_id?: string; reason?: string; already?: number; total?: number }>(
    "begin_refund",
    {
      p: {
        order_id: input.orderId,
        amount: input.amount,
        reason: input.reason ?? null,
        actor_id: input.actorId ?? null,
        payment_id: input.paymentId ?? null,
        method,
        late_payment: input.latePayment ?? false,
      },
    },
  );
  if (!begin.ok || !begin.refund_id) {
    return { ok: false, reason: begin.reason ?? "begin_failed" };
  }
  const refundId = begin.refund_id;

  // 2a. Manual refund — record as processing; finance completes it out-of-band.
  if (!isGateway) {
    await callRpc<{ ok: boolean }>("settle_refund", {
      p: { refund_id: refundId, status: "processing" },
    });
    await logEvent({
      orderId: input.orderId,
      entityType: "payment",
      entityId: input.orderId,
      event: "refund.initiated",
      actorType: input.actorId ? "staff" : "system",
      actorId: input.actorId,
      newState: "processing",
      notes: `Manual refund ₹${input.amount.toFixed(2)}${input.reason ? ` — ${input.reason}` : ""}`,
      metadata: { method: "manual", amount: input.amount, refundType: input.refundType ?? null, internalNote: input.internalNote ?? null },
    });
    return { ok: true, refundId, status: "processing", method };
  }

  // 2b. Gateway refund via Razorpay REST.
  const gw = await createRazorpayRefund(input.paymentId as string, toPaise(input.amount), {
    notes: { order_id: input.orderId, reason: input.reason ?? "" },
  });

  if (gw.status !== "ok") {
    await callRpc<{ ok: boolean }>("settle_refund", {
      p: {
        refund_id: refundId,
        status: "failed",
        error_code: gw.errorCode ?? null,
        error_description: gw.errorDescription ?? null,
      },
    });
    await logEvent({
      orderId: input.orderId,
      entityType: "payment",
      entityId: input.orderId,
      event: "refund.failed",
      actorType: input.actorId ? "staff" : "system",
      actorId: input.actorId,
      newState: "failed",
      notes: gw.errorDescription ?? "Gateway refund failed",
      metadata: { method: "gateway", amount: input.amount, errorCode: gw.errorCode },
    });
    // Operational alert — best-effort; must never affect the refund outcome returned to the caller.
    try {
      const base = process.env.NEXT_PUBLIC_SITE_URL || "";
      await notifyOps("refund.failed", {
        title: "Refund Failed",
        message: "A gateway refund failed and needs review.",
        fields: [
          { label: "Order", value: input.orderId },
          { label: "Amount", value: `₹${Number(input.amount ?? 0).toLocaleString("en-IN")}` },
          { label: "Gateway", value: "Razorpay" },
          { label: "Reason", value: gw.errorDescription ?? gw.errorCode ?? "gateway_failed" },
        ],
        url: base ? `${base}/admin/orders/${input.orderId}` : undefined,
        entityType: "refund", entityRef: input.orderId,
      });
    } catch { /* alerting must never break the refund path */ }
    return { ok: false, refundId, status: "failed", method, reason: gw.errorDescription ?? "gateway_failed" };
  }

  // 3. Record the gateway outcome; roll up the order summary from the ledger.
  const status = gw.refundStatus ?? "processing";
  await callRpc<{ ok: boolean }>("settle_refund", {
    p: { refund_id: refundId, razorpay_refund_id: gw.refundId ?? null, status },
  });
  await logEvent({
    orderId: input.orderId,
    entityType: "payment",
    entityId: input.orderId,
    event: status === "processed" ? "refund.processed" : "refund.initiated",
    actorType: input.actorId ? "staff" : "system",
    actorId: input.actorId,
    newState: status,
    notes: `Refund ₹${input.amount.toFixed(2)} via Razorpay${input.reason ? ` — ${input.reason}` : ""}`,
    metadata: { method: "gateway", amount: input.amount, razorpayRefundId: gw.refundId, refundType: input.refundType ?? null, internalNote: input.internalNote ?? null },
  });
  // Authoritative server-side `refund` (review priority B), keyed by order_number so it
  // matches the purchase transaction in GA4. Non-blocking.
  if (status === "processed") {
    try {
      const { data: o } = await createAdminClient().from("orders").select("order_number").eq("id", input.orderId).maybeSingle();
      const num = (o as { order_number?: string } | null)?.order_number;
      if (num) void trackServerRefund(num, input.amount);
    } catch (e) {
      console.error("server refund event failed (non-fatal)", e);
    }
  }
  return { ok: true, refundId, status, method };
}

/** List refunds for an order (admin detail view). */
export async function getOrderRefunds(orderId: string): Promise<
  Array<{
    id: string;
    amount: number;
    status: string;
    method: string;
    reason: string | null;
    error_description: string | null;
    razorpay_refund_id: string | null;
    created_at: string;
  }>
> {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: (q?: string) => any;
    };
  };
  const { data } = await db
    .from("refunds")
    .select("id,amount,status,method,reason,error_description,razorpay_refund_id,created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  return (data ?? []) as never;
}
