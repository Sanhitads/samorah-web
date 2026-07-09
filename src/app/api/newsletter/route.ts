import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * POST /api/newsletter { email, source } — "The Letters" subscription backend
 * (audit gap: the UI existed + the newsletter table existed, but there was no
 * persistence). Idempotent by email; a returning subscriber is reactivated.
 * (Double opt-in + Resend confirmation layer on later.)
 */
export const runtime = "nodejs";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const rl = rateLimit(request, { bucket: "newsletter", limit: 6, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: { email?: string; source?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email." }, { status: 400 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { error } = await db.from("newsletter").upsert(
      { email, source: body.source ?? "homepage", is_active: true, unsubscribed_at: null, updated_at: new Date().toISOString() },
      { onConflict: "email" },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("newsletter subscribe failed", e);
    return NextResponse.json({ ok: false, error: "Could not subscribe. Please try again." }, { status: 500 });
  }
}
