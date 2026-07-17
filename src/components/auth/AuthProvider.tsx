"use client";

import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/store/useUserStore";
import { useCheckoutStore } from "@/store/useCheckoutStore";
import { track } from "@/lib/analytics/events";
import { getDeviceId } from "@/lib/account/device";

/**
 * Keeps useUserStore in sync with the Supabase auth session.
 *
 * Subscribes to onAuthStateChange (which also emits an initial event on mount):
 *   • session present -> store the session, then load the profile (full_name,
 *                        role) from the `users` table and populate useUserStore
 *   • no session      -> clear the store
 *
 * Mount once near the root of the app. The profile fetch is fire-and-forget so
 * we never await inside the auth callback (Supabase guidance — avoids a lock).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useUserStore((s) => s.setUser);
  const setSession = useUserStore((s) => s.setSession);
  const clearUser = useUserStore((s) => s.clearUser);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadProfile(session: Session) {
      // Cast: avatar_url is newer than the generated DB types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase.from("users") as any)
        .select("full_name, role, avatar_url")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;

      setUser(
        {
          id: session.user.id,
          email: session.user.email ?? "",
          fullName: profile?.full_name ?? null,
          avatarUrl: profile?.avatar_url ?? (session.user.user_metadata?.avatar_url as string | undefined) ?? null,
        },
        profile?.role ?? "customer",
      );
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        clearUser();
        // Sign-out must not leave the previous customer's typed address in this tab for whoever
        // signs in next on a shared device. Gated on SIGNED_OUT, NOT on `!session`: this callback
        // also fires INITIAL_SESSION with a null session on every GUEST page load, and clearing
        // there would wipe a guest's checkout on arrival — the exact opposite of the store's job.
        if (event === "SIGNED_OUT") useCheckoutStore.getState().reset();
        return;
      }
      setSession(session);
      void loadProfile(session);

      // Record the sign-in ONCE (not on every page load / token refresh) — captures
      // provider, device, last-login, email-verified + detects first login (points 2,5,6,8,11,14).
      if (event === "SIGNED_IN") {
        void (async () => {
          try {
            const res = await fetch("/api/account/login-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: getDeviceId() }) });
            const d = res.ok ? await res.json() : {};
            const provider = d.provider ?? (session.user.app_metadata?.provider as string) ?? "email";
            track("login_success", { provider });
            track("login", { method: provider }); // GA4-recommended event
            if (provider === "google") track("google_login_success");
            else if (provider === "email" && session.user.app_metadata?.providers?.includes?.("email")) track("magic_link_completed");
            if (d.firstLogin) { track("first_login_completed", { provider }); track("sign_up", { method: provider }); try { localStorage.setItem("samorah_welcome", "1"); } catch { /* ignore */ } }
          } catch { /* analytics/capture must never block auth */ }
        })();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setUser, setSession, clearUser]);

  return <>{children}</>;
}
