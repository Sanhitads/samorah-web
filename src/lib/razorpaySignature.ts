import crypto from "node:crypto";
import { RAZORPAY } from "@/config/commerce";

/** Constant-time compare of two hex digests (avoids timing leaks). */
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Payment signature (Checkout handler / verify): HMAC-SHA256 of
 * `${order_id}|${payment_id}` keyed by the API SECRET. Proves the success callback
 * genuinely came from Razorpay for this order.
 */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!RAZORPAY.keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", RAZORPAY.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/**
 * Webhook signature: HMAC-SHA256 of the RAW request body keyed by the WEBHOOK
 * SECRET (the value you set in the Razorpay dashboard). Must be computed over the
 * exact raw bytes — never the re-serialised JSON.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!RAZORPAY.webhookSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", RAZORPAY.webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
