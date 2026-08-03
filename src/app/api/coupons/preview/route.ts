import { NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { repriceCart, type ClientCartLine } from "@/lib/repricing";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/coupons/preview { items, state, couponCode } — server-authoritative price preview for the
 * checkout summary. The client CANNOT resolve DB coupons (no registry, no catalogue relationships), so a
 * coupon's real effect — targeting, exclusions, auto-apply, per-line allocation, free shipping — is
 * computed here through the SAME engine as create-order (repriceCart → computeOrderTotals). No order is
 * created and nothing is reserved; this is display-only. The authoritative charge still happens at
 * create-order. Returns the full OrderTotals so the summary shows the exact numbers the customer will pay.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rl = rateLimit(request, { bucket: "coupon-preview", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: { items?: ClientCartLine[]; state?: string; couponCode?: string; email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 });
  }
  // Identity for first-order eligibility (Phase 2 #14): logged-in user from the session, else the email
  // the guest has entered in checkout. Unknown → eligibility is allowed here and re-checked at reserve.
  let userId: string | null = null;
  try { const supa = await createClient(); userId = (await supa.auth.getUser()).data.user?.id ?? null; } catch { /* guest */ }
  try {
    const priced = await repriceCart(body.items ?? [], body.state, body.couponCode, { userId, email: body.email });
    if (!priced.valid || !priced.totals) return NextResponse.json({ valid: false, reason: priced.reason });
    return NextResponse.json({ valid: true, totals: priced.totals });
  } catch (e) {
    console.error("coupon preview failed", e);
    return NextResponse.json({ valid: false }, { status: 200 }); // never break the summary
  }
}
