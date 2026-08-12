import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { rateLimit, tooManyRequests, clientIp } from "@/lib/rateLimit";
import { contactSchema, fieldErrors } from "@/lib/contact";
import { createEnquiry } from "@/services/enquiryService";

/**
 * POST /api/contact — public contact form. Reuses the newsletter pattern: in-memory rate limit,
 * zod validation (same schema as the client), a honeypot for bots, and a service-role insert.
 * Stores the enquiry and fires an Operations notification. No CAPTCHA (none used elsewhere); no
 * outbound email (reply-by-email is a future phase).
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rl = rateLimit(request, { bucket: "contact", limit: 5, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }

  // Honeypot — a hidden field a real person never fills. If set, silently accept (store nothing) so bots get no signal.
  if (typeof body.company === "string" && body.company.trim() !== "") return NextResponse.json({ ok: true });

  const errors = fieldErrors(contactSchema, {
    firstName: body.firstName, lastName: body.lastName, email: body.email, phone: body.phone,
    subject: body.subject, orderNumber: body.orderNumber, message: body.message, consent: !!body.consent,
  });
  if (Object.keys(errors).length) return NextResponse.json({ ok: false, error: "Please correct the highlighted fields.", fieldErrors: errors }, { status: 422 });

  const ipHash = createHash("sha256").update(clientIp(request)).digest("hex").slice(0, 16); // privacy: never store the raw IP
  const res = await createEnquiry({
    firstName: String(body.firstName).trim(),
    lastName: String(body.lastName ?? "").trim(),
    email: String(body.email).trim().toLowerCase(),
    phone: String(body.phone ?? "").trim(),
    subject: String(body.subject).trim(),
    orderNumber: String(body.orderNumber ?? "").trim(),
    message: String(body.message).trim(),
    consent: true,
    meta: { ipHash, ua: (request.headers.get("user-agent") ?? "").slice(0, 200) },
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: "We couldn't send your message right now. Please try again shortly." }, { status: 500 });
  return NextResponse.json({ ok: true, number: res.number });
}
