import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/account/redirect";

/**
 * Auth callback (PKCE) for Magic Link, email confirmation, password reset, and
 * (later) Google OAuth. The provider redirects here with `?code=`; we exchange
 * it for a session — which sets the auth cookies — then forward the user on.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only honor relative redirect targets (prevents open-redirect abuse).
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Missing code or exchange failed.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
