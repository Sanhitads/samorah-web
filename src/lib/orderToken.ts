import crypto from "node:crypto";
import { RAZORPAY } from "@/config/commerce";

/**
 * Order confirmation token — a capability token for the Thank-You page. Issued
 * server-side at finalize; the page verifies it before showing any order data, so
 * a bare order number can't be enumerated to read someone else's order (no IDOR).
 * HMAC over the order number with a server-only secret.
 */
function secret(): string {
  return process.env.ORDER_TOKEN_SECRET || RAZORPAY.keySecret || "samorah-dev-order-secret";
}

export function signOrderToken(orderNumber: string): string {
  return crypto.createHmac("sha256", secret()).update(orderNumber).digest("hex").slice(0, 32);
}

export function verifyOrderToken(orderNumber: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = signOrderToken(orderNumber);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
