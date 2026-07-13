"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthLoader } from "@/components/auth/AuthFlame";

/**
 * Update password — the destination of the reset-email link (and "change password" in
 * the account center). The reset link establishes a session via /auth/callback, so
 * updateUser({ password }) succeeds here. Previously this route didn't exist (reset
 * links 404'd) — now it's a proper premium screen.
 */
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: "error" | "info"; message: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setStatus(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setStatus({ type: "error", message: error.message }); return; }
    setStatus({ type: "info", message: "Password updated. Redirecting…" });
    setTimeout(() => router.replace("/account"), 1200);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        {busy && <AuthLoader label="Updating" />}
        <div className="auth-brand"><div className="auth-brand__mark">SAMORAH</div><div className="auth-brand__sub">Security</div></div>
        <h1 className="auth-title">Set a new password</h1>
        <p className="auth-sub">Choose a strong password for your account.</p>
        <form onSubmit={onSubmit} className="auth-stack">
          <input className="auth-field" type="password" placeholder="New password (min 6 characters)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <button className="auth-btn auth-btn--primary" type="submit" disabled={busy}>Update password</button>
        </form>
        {status && <p className={`auth-msg auth-msg--${status.type}`}>{status.message}</p>}
      </div>
    </main>
  );
}
