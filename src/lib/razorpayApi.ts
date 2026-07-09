import { RAZORPAY, COMMERCE } from "@/config/commerce";

/**
 * Server-side validation of a Razorpay payment before finalization. Never trust
 * the client callback blindly: fetch the payment with OUR keys and confirm it
 * belongs to this order, is in INR, and was actually captured/authorized. The
 * amount is returned so the finalizer can assert it equals the persisted total.
 * (Fetching with our keys implicitly proves the merchant account is ours.)
 */
export interface PaymentCheck {
  status: "ok" | "mismatch" | "unavailable";
  amountPaise?: number;
  method?: string; // razorpay method: upi | card | netbanking | wallet | ...
  reason?: string;
}

/**
 * Create a refund against a captured payment. Razorpay refunds are asynchronous:
 * the create call returns a refund object whose `status` is usually `pending`
 * (money in flight) and settles later to `processed`/`failed` via webhook. We map
 * that to our ledger states. `amountPaise` omitted = full refund.
 */
export interface RefundResult {
  status: "ok" | "failed" | "unavailable";
  refundId?: string;
  refundStatus?: "processing" | "processed" | "failed"; // normalized
  errorCode?: string;
  errorDescription?: string;
}

export async function createRazorpayRefund(
  paymentId: string,
  amountPaise: number,
  opts?: { notes?: Record<string, string>; speed?: "normal" | "optimum" },
): Promise<RefundResult> {
  if (!RAZORPAY.configured) return { status: "unavailable", errorDescription: "not configured" };
  try {
    const auth = Buffer.from(`${RAZORPAY.keyId}:${RAZORPAY.keySecret}`).toString("base64");
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountPaise,
        speed: opts?.speed ?? "normal",
        notes: opts?.notes ?? {},
      }),
    });
    const body = (await res.json()) as {
      id?: string;
      status?: string; // pending | processed | failed
      error?: { code?: string; description?: string };
    };
    if (!res.ok || body.error) {
      return {
        status: "failed",
        errorCode: body.error?.code,
        errorDescription: body.error?.description ?? `refund ${res.status}`,
      };
    }
    const normalized = body.status === "processed" ? "processed" : body.status === "failed" ? "failed" : "processing";
    return { status: "ok", refundId: body.id, refundStatus: normalized };
  } catch (e) {
    return { status: "unavailable", errorDescription: e instanceof Error ? e.message : "error" };
  }
}

export async function validateRazorpayPayment(orderId: string, paymentId: string): Promise<PaymentCheck> {
  if (!RAZORPAY.configured) return { status: "unavailable", reason: "not configured" };
  try {
    const auth = Buffer.from(`${RAZORPAY.keyId}:${RAZORPAY.keySecret}`).toString("base64");
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return { status: "unavailable", reason: `fetch ${res.status}` };
    const p = (await res.json()) as { order_id?: string; currency?: string; status?: string; amount?: number; method?: string };
    if (p.order_id !== orderId) return { status: "mismatch", reason: "order_id mismatch" };
    if ((p.currency ?? "").toUpperCase() !== COMMERCE.currency) return { status: "mismatch", reason: "currency mismatch" };
    if (p.status !== "captured" && p.status !== "authorized") return { status: "mismatch", reason: `payment status ${p.status}` };
    return { status: "ok", amountPaise: p.amount, method: p.method };
  } catch (e) {
    return { status: "unavailable", reason: e instanceof Error ? e.message : "error" };
  }
}
