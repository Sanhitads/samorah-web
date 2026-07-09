import { NextResponse } from "next/server";
import { validateCoupon } from "@/services/couponService";

/**
 * POST /api/coupons/apply { code, subtotalPaise } — validate a coupon against the
 * cart and return a specific reason (expired / min not met / used up) so the
 * shopper gets immediate feedback. The AUTHORITATIVE discount is still computed
 * server-side at create-order; this is a UX preview + guardrail.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { code?: string; subtotalPaise?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid request." }, { status: 400 });
  }
  if (!body.code) return NextResponse.json({ ok: false, reason: "Enter a code." }, { status: 400 });
  const result = await validateCoupon(body.code, Math.max(0, Number(body.subtotalPaise ?? 0)));
  return NextResponse.json(result);
}
