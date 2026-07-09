import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/services/accountService";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * POST /api/stock/notify { variantId, email } — back-in-stock "Notify Me" (audit
 * gap: stock_notifications table existed with no capture path). Idempotent per
 * (variant, email); a restock job flips is_notified + emails later.
 */
export const runtime = "nodejs";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const rl = rateLimit(request, { bucket: "stock-notify", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: { variantId?: string; email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!body.variantId || !email || !EMAIL.test(email)) return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });

  try {
    const user = await getSessionUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { error } = await db.from("stock_notifications").upsert(
      { variant_id: body.variantId, email, user_id: user?.id ?? null, is_notified: false },
      { onConflict: "variant_id,email" },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("stock notify failed", e);
    return NextResponse.json({ ok: false, error: "Could not register. Please try again." }, { status: 500 });
  }
}
