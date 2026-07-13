import { NextResponse } from "next/server";
import { getSessionUser } from "@/services/accountService";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { hashIp } from "@/lib/account/privacy";
import { logAccountEvent, type AccountEvent } from "@/services/accountAuditService";

/** POST /api/account/audit { event } — record a client-triggered account event. Only a
 *  whitelisted set is accepted (server-side events use logAccountEvent directly). */
export const runtime = "nodejs";
const CLIENT_EVENTS: AccountEvent[] = ["password_change", "logout"];

export async function POST(request: Request) {
  const rl = rateLimit(request, { bucket: "account-audit", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!CLIENT_EVENTS.includes(body.event)) return NextResponse.json({ error: "event not allowed" }, { status: 400 });

  await logAccountEvent(user.id, body.event, { ipHash: hashIp(clientIp(request)) });
  return NextResponse.json({ ok: true });
}
