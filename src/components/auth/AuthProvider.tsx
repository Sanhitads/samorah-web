"use client";

import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/store/useUserStore";

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
      const { data: profile } = await supabase
        .from("users")
        .select("full_name, role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;

      setUser(
        {
          id: session.user.id,
          email: session.user.email ?? "",
          fullName: profile?.full_name ?? null,
        },
        profile?.role ?? "customer",
      );
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        clearUser();
        return;
      }
      setSession(session);
      void loadProfile(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setUser, setSession, clearUser]);

  return <>{children}</>;
}
