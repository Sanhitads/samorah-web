/**
 * Cancellation service — the commercial cancel of an order (SLP principle 7).
 * This is a FINANCE/CS action, not a warehouse one: it lives in Order Management,
 * gated to manager+ at the route, and is deliberately absent from the Fulfillment
 * Board (principles a/c — warehouse staff never perform financial operations).
 *
 * Cancel ≠ refund. Cancelling stops the order and optionally releases inventory;
 * returning money is a SEPARATE, explicit choice (issueRefund) delegated to the
 * refund service. Both write to the immutable audit stream.
 */
import { getOrderByNumber } from "@/services/orderService";
import { issueRefund, type IssueRefundResult } from "@/services/refundService";
import { logEvent } from "@/services/auditService";
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CancellationEmailInput } from "@/lib/email";

export type CancellationType = "customer" | "warehouse_exception" | "fraud" | "admin";

export interface CancelOrderInput {
  orderNumber: string;
  reason?: string;
  cancellationType?: CancellationType; // the typed cause (review point 1)
  releaseInventory?: boolean;
  issueRefund?: boolean;
  refundAmount?: number; // rupees; defaults to the full remaining balance
  actorId?: string;
}

export interface CancelOrderResult {
  ok: boolean;
  alreadyCancelled?: boolean;
  previousStatus?: string;
  restocked?: number;
  refund?: IssueRefundResult | null;
  reason?: string; // failure reason when ok=false
}

export async function cancelOrder(input: CancelOrderInput): Promise<CancelOrderResult> {
  const order = await getOrderByNumber(input.orderNumber);
  if (!order) return { ok: false, reason: "not_found" };

  const o = order as unknown as {
    id: string;
    status: string;
    payment_status: string;
    total_amount: number;
    refund_amount: number | null;
    razorpay_payment_id: string | null;
  };

  const cancel = await callRpc<{
    ok: boolean;
    already_cancelled?: boolean;
    previous_status?: string;
    restocked?: number;
    reason?: string;
  }>("cancel_order", {
    p: {
      order_id: o.id,
      reason: input.reason ?? null,
      cancellation_type: input.cancellationType ?? "admin",
      actor_id: input.actorId ?? null,
      release_inventory: Boolean(input.releaseInventory),
    },
  });

  if (!cancel.ok) return { ok: false, reason: cancel.reason ?? "cancel_failed", previousStatus: cancel.previous_status };
  if (cancel.already_cancelled) return { ok: true, alreadyCancelled: true, previousStatus: cancel.previous_status };

  await logEvent({
    orderId: o.id,
    entityType: "order",
    entityId: o.id,
    event: "order.cancelled",
    actorType: input.actorId ? "staff" : "system",
    actorId: input.actorId,
    previousState: cancel.previous_status,
    newState: "cancelled",
    notes: input.reason ?? undefined,
    metadata: { restocked: cancel.restocked ?? 0, releaseInventory: Boolean(input.releaseInventory), cancellationType: input.cancellationType ?? "admin" },
  });

  // Optional, explicit refund — only for orders that actually took money.
  let refund: IssueRefundResult | null = null;
  const paid = o.payment_status !== "pending" && o.payment_status !== "failed";
  if (input.issueRefund && paid) {
    const remaining = Number(o.total_amount) - Number(o.refund_amount ?? 0);
    const amount = input.refundAmount != null ? Math.min(input.refundAmount, remaining) : remaining;
    if (amount > 0) {
      refund = await issueRefund({
        orderId: o.id,
        amount,
        reason: input.reason,
        actorId: input.actorId,
        paymentId: o.razorpay_payment_id,
      });
    }
  }

  // Notify the customer (async, via the fulfillment worker). Idempotent per order.
  try {
    await callRpc<void>("queue_fulfillment_job", { p_order_id: o.id, p_job_type: "cancellation_email" });
  } catch (e) {
    console.error("queue cancellation_email failed", e); // never block the cancel
  }

  return { ok: true, previousStatus: cancel.previous_status, restocked: cancel.restocked, refund };
}

/** Assemble the cancellation email payload (order + latest live refund) for the worker. */
export async function getCancellationInfo(orderId: string): Promise<CancellationEmailInput | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("orders")
    .select("order_number,email,ship_full_name,cancel_reason")
    .eq("id", orderId)
    .maybeSingle();
  if (!data) return null;
  const o = data as unknown as {
    order_number: string;
    email: string;
    ship_full_name: string | null;
    cancel_reason: string | null;
  };

  // Latest non-failed refund, if any.
  const loose = createAdminClient() as unknown as {
    from: (t: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: (q?: string) => any;
    };
  };
  const { data: refunds } = await loose
    .from("refunds")
    .select("amount,status,method")
    .eq("order_id", orderId)
    .neq("status", "failed")
    .order("created_at", { ascending: false });

  const latest = (refunds ?? [])[0] as { amount: number; status: string; method: string } | undefined;

  return {
    order_number: o.order_number,
    email: o.email,
    ship_full_name: o.ship_full_name,
    reason: o.cancel_reason,
    refund: latest
      ? {
          amount: Number(latest.amount),
          status: latest.status as "processing" | "processed" | "failed",
          method: latest.method as "gateway" | "manual",
        }
      : null,
  };
}
