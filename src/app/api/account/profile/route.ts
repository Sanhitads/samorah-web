import { NextResponse } from "next/server";
import { getSessionUser, updateProfile } from "@/services/accountService";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { hashIp } from "@/lib/account/privacy";
import { logAccountEvent } from "@/services/accountAuditService";

/** POST /api/account/profile { fullName?, marketingConsent? } — edit own profile. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rl = rateLimit(request, { bucket: "account-profile", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const res = await updateProfile(user.id, { fullName: body.fullName, marketingConsent: body.marketingConsent });
  if (res.ok) {
    const ipHash = hashIp(clientIp(request));
    if (body.marketingConsent !== undefined) await logAccountEvent(user.id, "newsletter_change", { metadata: { consent: Boolean(body.marketingConsent) }, ipHash });
    if (body.fullName !== undefined) await logAccountEvent(user.id, "profile_update", { metadata: { field: "display_name" }, ipHash });
  }
  return NextResponse.json(res);
}
