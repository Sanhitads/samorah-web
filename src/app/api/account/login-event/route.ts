import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Records a sign-in (review points 2·5·6·8·11). Called from AuthProvider on the actual
 * SIGNED_IN event. Writes a login_history row (provider/device/browser/ip) and updates
 * the profile's last-login + email-verified + provider metadata. Returns { firstLogin }
 * so the client can trigger onboarding exactly once.
 */
export const runtime = "nodejs";

function parseUA(ua: string): { device: string; browser: string } {
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh|Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return { device, browser };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const authUser = auth.user;
  if (!authUser) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const provider = (authUser.app_metadata?.provider as string) || "email";
  const identityId = authUser.identities?.[0]?.id ?? null;
  const emailVerified = Boolean(authUser.email_confirmed_at);
  const ua = request.headers.get("user-agent") ?? "";
  const { device, browser } = parseUA(ua);
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const country = request.headers.get("x-vercel-ip-country") ?? null;

  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  // First-login detection (once): flip `onboarded` false → true atomically-ish.
  let firstLogin = false;
  try {
    const { data: prof } = await db.from("users").select("onboarded,provider").eq("id", authUser.id).maybeSingle();
    firstLogin = prof ? prof.onboarded === false : false;
  } catch { /* ignore */ }

  try {
    await db.from("users").update({
      last_login_at: new Date().toISOString(), last_login_provider: provider, email_verified: emailVerified,
      provider, provider_id: identityId, onboarded: true, updated_at: new Date().toISOString(),
    }).eq("id", authUser.id);
  } catch { /* non-fatal */ }

  try {
    await db.from("login_history").insert({ user_id: authUser.id, provider, ip, user_agent: ua.slice(0, 400), device, browser, country });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, firstLogin, provider });
}
