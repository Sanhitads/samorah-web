"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Authentication ACTIONS only.
 *
 * Intentionally decoupled from useUserStore and from any UI: AuthProvider owns
 * session + profile + store synchronization (via onAuthStateChange). Components
 * call these actions; the store updates itself in response. Each action returns
 * the raw Supabase result ({ data, error }) for the caller to handle.
 *
 * Magic Link and Google OAuth redirect to /auth/callback (Step 3), which
 * exchanges the code for a session.
 */
export function useAuth() {
  const supabase = useMemo(() => createClient(), []);

  const callbackUrl = (next?: string) => {
    const url = new URL("/auth/callback", window.location.origin);
    if (next) url.searchParams.set("next", next);
    return url.toString();
  };

  return {
    /** Email + password sign-in. */
    signInWithPassword: (email: string, password: string) =>
      supabase.auth.signInWithPassword({ email, password }),

    /**
     * Register with email + password. `full_name` is passed as user metadata so
     * the Phase 2 handle_new_user trigger records it on the profile. Sends a
     * confirmation email (link returns to /auth/callback).
     */
    signUp: (email: string, password: string, fullName?: string) =>
      supabase.auth.signUp({
        email,
        password,
        options: {
          data: fullName ? { full_name: fullName } : undefined,
          emailRedirectTo: callbackUrl(),
        },
      }),

    /** Passwordless magic-link sign-in. */
    signInWithMagicLink: (email: string) =>
      supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl() },
      }),

    /** Google OAuth. Redirects to Google, then back to /auth/callback?code= which
     *  exchanges the code; a new user's profile row is created by the handle_new_user
     *  trigger (name from Google metadata). `next` preserves the intended destination. */
    signInWithGoogle: (next?: string) =>
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl(next) },
      }),

    /** Send a password-reset email; the link returns to the update-password page. */
    resetPassword: (email: string) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl("/account/update-password"),
      }),

    /** Sign out (AuthProvider clears the store via onAuthStateChange). */
    signOut: () => supabase.auth.signOut(),
  };
}
