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

export interface IssueRefundInput {
  orderId: string;
  amount: number; // rupees; the amount to refund (defaults to full remaining if omitted upstream)
  reason?: string;
  actorId?: string;
  paymentId?: string | null; // razorpay_payment_id; null → manual refund
}

export interface IssueRefundResult {
  ok: boolean;
  refundId?: string;
  status?: "processing" | "processed" | "failed";
  method?: "gateway" | "manual";
  reason?: string; // failure reason when ok=false
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
      metadata: { method: "manual", amount: input.amount },
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
    metadata: { method: "gateway", amount: input.amount, razorpayRefundId: gw.refundId },
  });
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
    .select("id,amount,status,method,reason,razorpay_refund_id,created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  return (data ?? []) as never;
}
