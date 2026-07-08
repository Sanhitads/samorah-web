import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { releaseExpiredReservations, expireStalePendingOrders } from "@/services/orderService";

/**
 * POST /api/cron/reservations — housekeeping, run on a schedule (Vercel Cron or an
 * external pinger). Frees expired stock holds and cancels unpaid pending orders
 * older than 30 minutes (releasing their holds). Guarded by a shared secret so it
 * can't be triggered by the public.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const releasedHolds = await releaseExpiredReservations();
    const expiredOrders = await expireStalePendingOrders(30);
    return NextResponse.json({ releasedHolds, expiredOrders });
  } catch (e) {
    console.error("reservations cron failed", e);
    return NextResponse.json({ error: "Cron failed." }, { status: 500 });
  }
}
