import { NextResponse } from "next/server";
import { RAZORPAY, COMMERCE } from "@/config/commerce";
import { repriceCart, type ClientCartLine } from "@/lib/repricing";

/**
 * POST /api/razorpay/create-order — Stage 2A. Re-prices the cart server-side,
 * validates the composition, then creates a Razorpay order for the SERVER-computed
 * `payable` (never a client amount). Returns the Razorpay order id + public key so
 * the client can open Checkout. No order is persisted yet (that's the webhook,
 * Stage 2B).
 */
export const runtime = "nodejs";

interface Body {
  items: ClientCartLine[];
  state?: string;
  email?: string;
  couponCode?: string;
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

  const priced = await repriceCart(body.items ?? [], body.state, body.couponCode);
  if (!priced.valid || !priced.totals) {
    return NextResponse.json({ error: priced.reason ?? "Your bag could not be validated." }, { status: 422 });
  }

  const amount = priced.totals.payable; // paise, server-authoritative
  if (amount <= 0) {
    // A gift-card/loyalty-covered ₹0 order is confirmed internally, not via Razorpay
    // (Stage 2B). Gift cards aren't live yet, so this shouldn't occur.
    return NextResponse.json({ error: "This order needs no payment." }, { status: 400 });
  }

  // Create the Razorpay order via the REST API (no SDK dependency).
  const auth = Buffer.from(`${RAZORPAY.keyId}:${RAZORPAY.keySecret}`).toString("base64");
  const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount,
      currency: COMMERCE.currency,
      receipt: `rcpt_${Date.now()}`,
      notes: { state: body.state ?? "", items: String(priced.lines.length) },
    }),
  });

  if (!rzpRes.ok) {
    const detail = await rzpRes.text();
    console.error("razorpay create-order failed", rzpRes.status, detail);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }

  const order = (await rzpRes.json()) as { id: string; amount: number; currency: string };

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: RAZORPAY.keyId,
    // A compact summary so the client can show the exact server figures (paise).
    summary: {
      subtotal: priced.totals.subtotal,
      discount: priced.totals.discount,
      shipping: priced.totals.shipping,
      gst: priced.totals.gst,
      total: priced.totals.total,
      payable: priced.totals.payable,
    },
  });
}
