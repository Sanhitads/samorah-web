import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { hashIp } from "@/lib/account/privacy";
import { logAccountEvent } from "@/services/accountAuditService";

/**
 * Records a sign-in (review points 2·3·5·6·8·9·10). Called from AuthProvider on the
 * actual SIGNED_IN event. Writes a login_history row (hashed IP, device, browser),
 * upserts the device + ALL linked providers (multi-provider), updates the profile's
 * last-login/email-verified, writes an account_audit "login", and returns { firstLogin }.
 */
export const runtime = "nodejs";

function parseUA(ua: string): { device: string; browser: string } {
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh|Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return { device, browser };
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { bucket: "login-event", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const authUser = auth.user;
  if (!authUser) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {};
  try { body = await request.json(); } catch { /* device_id optional */ }
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.slice(0, 64) : null;

  const provider = (authUser.app_metadata?.provider as string) || "email";
  const emailVerified = Boolean(authUser.email_confirmed_at);
  const ua = request.headers.get("user-agent") ?? "";
  const { device, browser } = parseUA(ua);
  const ipHash = hashIp(clientIp(request));
  const country = request.headers.get("x-vercel-ip-country") ?? null;
  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  // First-login detection (once).
  let firstLogin = false;
  try {
    const { data: prof } = await db.from("users").select("onboarded").eq("id", authUser.id).maybeSingle();
    firstLogin = prof ? prof.onboarded === false : false;
  } catch { /* ignore */ }

  // Profile metadata (last login, verified, primary provider).
  try {
    await db.from("users").update({
      last_login_at: new Date().toISOString(), last_login_provider: provider, email_verified: emailVerified,
      provider, provider_id: authUser.identities?.[0]?.id ?? null, onboarded: true, updated_at: new Date().toISOString(),
    }).eq("id", authUser.id);
  } catch { /* non-fatal */ }

  // Multi-provider (point 3) — mirror EVERY linked identity into user_auth_providers.
  try {
    const identities = authUser.identities ?? [];
    for (const idn of identities) {
      await db.from("user_auth_providers").upsert(
        { user_id: authUser.id, provider: idn.provider, provider_id: idn.id, email: (idn.identity_data as any)?.email ?? authUser.email ?? null }, // eslint-disable-line @typescript-eslint/no-explicit-any
        { onConflict: "user_id,provider" },
      );
    }
  } catch { /* non-fatal */ }

  // Device (point 2) — upsert + bump last_active.
  if (deviceId) {
    try {
      await db.from("user_devices").upsert(
        { user_id: authUser.id, device_id: deviceId, label: `${browser} on ${device}`, device, browser, last_active_at: new Date().toISOString() },
        { onConflict: "user_id,device_id" },
      );
    } catch { /* non-fatal */ }
  }

  // Login history (hashed IP, no raw IP) + account audit.
  try { await db.from("login_history").insert({ user_id: authUser.id, provider, ip_hash: ipHash, device_id: deviceId, user_agent: ua.slice(0, 400), device, browser, country }); } catch { /* non-fatal */ }
  await logAccountEvent(authUser.id, "login", { metadata: { provider, device, browser, firstLogin }, ipHash });

  return NextResponse.json({ ok: true, firstLogin, provider });
}
