import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { emailConfigured, sendEmail } from "@/lib/email";
import { buildNewsletterWelcomeEmail } from "@/lib/email/newsletterWelcome";
import { COMMERCE } from "@/config/commerce";

/**
 * POST /api/newsletter { email, source } — "The Letters" subscription backend.
 * Idempotent by email; a returning subscriber is reactivated. On a NEW/reactivated
 * subscription we send a quiet welcome email so "Receive the Letters" actually
 * delivers something — best-effort, never blocking the response. (Token-based
 * double opt-in can layer on later; this is single opt-in with a welcome note.)
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
    // Only welcome a NEW or reactivated subscriber — never re-welcome an already-active one.
    const { data: existing } = await db.from("newsletter").select("is_active").eq("email", email).maybeSingle();
    const firstTime = !existing || existing.is_active === false;
    const { error } = await db.from("newsletter").upsert(
      { email, source: body.source ?? "homepage", is_active: true, unsubscribed_at: null, updated_at: new Date().toISOString() },
      { onConflict: "email" },
    );
    if (error) throw error;
    // Quiet welcome email so "Receive the Letters" delivers a confirmation. Best-effort: a send
    // failure (or email not configured) must NEVER fail the subscription.
    if (firstTime && emailConfigured()) {
      const mail = buildNewsletterWelcomeEmail();
      void sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: COMMERCE.support.email }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("newsletter subscribe failed", e);
    return NextResponse.json({ ok: false, error: "Could not subscribe. Please try again." }, { status: 500 });
  }
}
