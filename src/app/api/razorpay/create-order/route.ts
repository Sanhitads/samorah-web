import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { RAZORPAY, COMMERCE } from "@/config/commerce";
import { repriceCart, type ClientCartLine } from "@/lib/repricing";
import { buildPendingPayload, createPendingOrder, reserveStock, voidPendingOrder, type OrderAddress } from "@/services/orderService";
import { reserveCoupon, redemptionIdentity } from "@/services/couponRedemptionService";
import { createClient } from "@/lib/supabase/server";
import type { OrderTotals } from "@/lib/commerce";

/** Deterministic SHA-256 fingerprint of the priced cart (server-side only) —
 *  {sku:qty:unit:discount} per line + shipping + GST + payable. Detects tampering
 *  and aids fraud/debug investigation. */
function computeCartHash(t: OrderTotals, skuOf: (key: string) => string, state: string): string {
  const lines = t.lines
    .map((l) => `${skuOf(l.key)}:${l.qty}:${l.unitPrice}:${l.discount}`)
    .sort()
    .join("|");
  const canonical = `${lines}#ship:${t.shipping}:${t.shippingGst}#gst:${t.gst}#pay:${t.payable}#st:${state.toLowerCase()}`;
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * POST /api/razorpay/create-order — Stage 2B. Re-prices the cart server-side,
 * validates the composition, creates a Razorpay order for the SERVER-computed
 * `payable` (never a client amount), then writes a PENDING order (server-priced,
 * keyed by razorpay_order_id). Payment success — via /verify OR the webhook —
 * finalizes that pending order through the single idempotent persistOrder().
 */
export const runtime = "nodejs";

/** In local dev, surface the real error message so failures are debuggable. */
const devDetail = (e: unknown) =>
  process.env.NODE_ENV !== "production" ? { detail: e instanceof Error ? e.message : String(e) } : {};

interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}
interface Body {
  items: ClientCartLine[];
  state?: string;
  email?: string;
  couponCode?: string;
  address?: OrderAddress;
  billing?: OrderAddress; // separate billing address (optional)
  business?: { companyName?: string; gstin?: string }; // B2B GST invoice (optional)
  notes?: string;
  utm?: Utm;
}

export async function POST(request: Request) {
  // Rate limit — starting a payment is expensive (reprice + reserve + Razorpay).
  const rl = rateLimit(request, { bucket: "create-order", limit: 12, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  if (!RAZORPAY.configured) {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const address = body.address;
  const email = body.email?.trim();
  if (!address || !email) {
    return NextResponse.json({ error: "Delivery details are required." }, { status: 400 });
  }
  // Identity (authed user_id else guest email) — for per-customer + first-order eligibility. Resolved
  // BEFORE pricing so the authoritative reprice already reflects first-order ineligibility.
  let userId: string | null = null;
  try {
    const supa = await createClient();
    userId = (await supa.auth.getUser()).data.user?.id ?? null;
  } catch { /* guest checkout — identity falls back to email */ }

  // Place of supply = the delivery state — never the client's chosen `state`.
  let priced: Awaited<ReturnType<typeof repriceCart>>;
  try {
    priced = await repriceCart(body.items ?? [], address.state, body.couponCode, { userId, email });
  } catch (e) {
    console.error("repriceCart failed", e);
    return NextResponse.json({ error: "Could not price your bag. Please try again.", ...devDetail(e) }, { status: 500 });
  }
  if (!priced.valid || !priced.totals) {
    return NextResponse.json({ error: priced.reason ?? "Your bag could not be validated." }, { status: 422 });
  }

  // Every coupon the engine actually applied — MANUAL or AUTO-APPLY, DISCOUNT and/or FREE-SHIPPING (each
  // is ledgered so all usage limits hold). Composition is not a coupon. Benefit = the promo's line
  // discount, or for a free-shipping promo the shipping it waived. Zero-benefit coupons aren't reserved.
  const COMPOSITION_CODE = "DISCOVERY_COMPOSITION";
  const appliedCoupons = priced.totals.promotions
    .filter((p) => p.code !== COMPOSITION_CODE)
    .map((p) => ({ code: p.code, benefit: p.freeShipping ? priced.totals!.freeShippingBenefit : p.amount }))
    .filter((p) => p.benefit > 0);

  const amount = priced.totals.payable; // paise, server-authoritative
  if (amount <= 0) {
    // A gift-card/loyalty-covered ₹0 order is confirmed internally, not via Razorpay
    // (later). Gift cards aren't live yet, so this shouldn't occur.
    return NextResponse.json({ error: "This order needs no payment." }, { status: 400 });
  }

  // Fingerprint + composition ids (server-derived) — attached to the Razorpay order
  // notes for reconciliation and stored on our order too.
  const cartHash = computeCartHash(priced.totals, (key) => priced.details[key]?.sku ?? key, address.state);
  const compositionIds = [...new Set(priced.lines.map((l) => l.compositionId).filter(Boolean))].join(",");

  // 0) Reserve stock BEFORE charging — atomic availability check prevents oversell
  //    and blocks payment for anything that just sold out. Air lines carry no
  //    variant/stock, so only candle lines (with a variantId) are held.
  const reservationSession = crypto.randomUUID();
  const reserveItems = priced.totals.lines
    .map((l) => ({ detail: priced.details[l.key], qty: l.qty }))
    .filter((x) => x.detail?.variantId)
    .map((x) => ({ variantId: x.detail!.variantId as string, quantity: x.qty, sku: x.detail!.sku }));
  if (reserveItems.length) {
    let reserved: { ok: boolean };
    try {
      reserved = await reserveStock({ sessionId: reservationSession, items: reserveItems });
    } catch (e) {
      console.error("reserveStock failed (is the Stage 2B migration applied?)", e);
      return NextResponse.json({ error: "Checkout is temporarily unavailable. Please try again shortly.", ...devDetail(e) }, { status: 500 });
    }
    if (!reserved.ok) {
      return NextResponse.json(
        { error: "One or more items in your collection just sold out. Please review your bag." },
        { status: 409 },
      );
    }
  }

  // 1) Create the Razorpay order via REST (no SDK dependency).
  const auth = Buffer.from(`${RAZORPAY.keyId}:${RAZORPAY.keySecret}`).toString("base64");
  const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount,
      currency: COMMERCE.currency,
      receipt: `rcpt_${Date.now()}`,
      notes: {
        state: address.state,
        email,
        cart_hash: cartHash,
        tax_version: priced.totals.taxVersion,
        promotion_version: priced.totals.pricingVersion,
        commerce_version: priced.totals.commerceVersion,
        composition_ids: compositionIds,
      },
    }),
  });
  if (!rzpRes.ok) {
    const detail = await rzpRes.text();
    console.error("razorpay create-order failed", rzpRes.status, detail);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
  const order = (await rzpRes.json()) as { id: string; amount: number; currency: string };

  // 2) Persist the PENDING order so the webhook can finalize even if the browser
  //    closes before /verify. The reprice is the single source of the snapshot.
  const payload = buildPendingPayload(priced, {
    email,
    address,
    couponCode: body.couponCode,
    notes: body.notes,
    razorpayOrderId: order.id,
    cartHash,
    reservationSession, // links the holds made above to this order
    utm: body.utm,
    business: body.business,
    billing: body.billing,
  });
  if (!payload) {
    return NextResponse.json({ error: "Your bag could not be validated." }, { status: 422 });
  }
  let pending: { orderId: string; orderNumber: string };
  try {
    pending = await createPendingOrder(payload);
  } catch (e) {
    console.error("create pending order failed", e);
    return NextResponse.json({ error: "Could not start payment. Please try again.", ...devDetail(e) }, { status: 500 });
  }

  // 3) Reserve the applied coupon's slot BEFORE the client pays (atomic; enforces global + per-customer
  //    limits). If it can't be reserved for a MANUALLY-typed code, we must NOT let the client pay the
  //    discounted amount — void this attempt and return the correct total to review + reconfirm (never
  //    overcharge). An AUTO-apply coupon that can't be reserved (per-customer edge) keeps the previewed
  //    price (no overcharge); its global limit is already enforced by the registry, per-user best-effort.
  {
    const identity = redemptionIdentity(userId, email);
    for (const ac of appliedCoupons) {
      const rr = await reserveCoupon({ orderId: pending.orderId, code: ac.code, identity, userId, email, benefitPaise: ac.benefit });
      if (rr.reserved) continue;
      const isManual = !!body.couponCode && ac.code === body.couponCode.toUpperCase();
      if (isManual) {
        // Void this attempt (also releases any coupons already reserved for the order) + reconfirm.
        await voidPendingOrder(pending.orderId);
        let t2: typeof priced.totals | null = null;
        try { const p2 = await repriceCart(body.items ?? [], address.state, undefined); if (p2.valid) t2 = p2.totals; } catch { /* show no summary */ }
        const reason = rr.reason === "per_user" ? "You’ve already used this code." :
          rr.reason === "exhausted" ? "This code has reached its usage limit." :
          rr.reason === "not_first_order" ? "This code is only valid on your first order." :
          "This code can no longer be applied.";
        return NextResponse.json({
          repriced: true, coupon: ac.code, reason,
          summary: t2 ? { subtotal: t2.subtotal, discount: t2.discount, shipping: t2.shipping, gst: t2.gst, total: t2.total, payable: t2.payable } : undefined,
        }, { status: 409 });
      }
      console.warn(`auto-apply coupon ${ac.code} not reserved (${rr.reason}) — keeping previewed price`);
    }
  }

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: RAZORPAY.keyId,
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
