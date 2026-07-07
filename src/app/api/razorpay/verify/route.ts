import { NextResponse } from "next/server";
import { RAZORPAY } from "@/config/commerce";
import { verifyPaymentSignature } from "@/lib/razorpaySignature";
import { persistOrder } from "@/services/orderService";

/**
 * POST /api/razorpay/verify — the fast client path. The Checkout success handler
 * posts the payment signature here; we verify it (HMAC over order|payment with the
 * API secret), then call the SHARED persistOrder(). This route contains NO order
 * creation logic of its own — the webhook calls the exact same finalizer, so
 * whichever arrives first writes the order and the other exits idempotently.
 */
export const runtime = "nodejs";

interface Body {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}

export async function POST(request: Request) {
  if (!RAZORPAY.configured) {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment details." }, { status: 400 });
  }

  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
  }

  try {
    const result = await persistOrder({
      razorpayOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      source: "verify",
    });
    if (result.mismatch) {
      return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
    }
    if (!result.found) {
      // Pending order not found (shouldn't happen) — let the webhook be the backstop.
      return NextResponse.json({ error: "Order is being confirmed." }, { status: 202 });
    }
    // `token` is the capability token the Thank-You page verifies (no IDOR).
    return NextResponse.json({ orderNumber: result.orderNumber, token: result.token });
  } catch (e) {
    console.error("verify persistOrder failed", e);
    return NextResponse.json({ error: "Could not confirm your order." }, { status: 500 });
  }
}
