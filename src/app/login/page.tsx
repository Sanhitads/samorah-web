"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUserStore } from "@/store/useUserStore";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AuthLoader } from "@/components/auth/AuthFlame";

type Status = { type: "error" | "info"; message: string } | null;

function LoginInner() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const user = useUserStore((s) => s.user);
  const role = useUserStore((s) => s.role);
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);

  const [mode, setMode] = useState<"email" | "magic">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false); // OAuth redirect in flight

  useEffect(() => {
    if (isLoggedIn && next && next.startsWith("/")) router.replace(next);
  }, [isLoggedIn, next, router]);

  async function run(action: () => Promise<{ error: { message: string } | null }>, ok?: string) {
    setBusy(true); setStatus(null);
    const { error } = await action();
    setBusy(false);
    if (error) setStatus({ type: "error", message: error.message });
    else if (ok) setStatus({ type: "info", message: ok });
  }

  const onEmailSignIn = (e: FormEvent) => { e.preventDefault(); return run(() => auth.signInWithPassword(email, password), "Signed in."); };
  const onMagicLink = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return setStatus({ type: "error", message: "Enter your email first." });
    return run(() => auth.signInWithMagicLink(email), "Magic link sent — check your inbox to continue.");
  };

  if (isLoggedIn && user) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-brand"><div className="auth-brand__mark">SAMORAH</div><div className="auth-brand__sub">Your account</div></div>
          <p className="auth-sub">Signed in as <strong>{user.email}</strong> · {role}</p>
          <button className="auth-btn auth-btn--ghost" disabled={busy} onClick={() => run(() => auth.signOut())}>Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        {(busy || redirecting) && <AuthLoader label={redirecting ? "Redirecting to Google" : "One moment"} />}

        <div className="auth-brand"><div className="auth-brand__mark">SAMORAH</div><div className="auth-brand__sub">Members</div></div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Sign in to your account — your cart, wishlist and rewards follow you.</p>

        <div className="auth-stack">
          <GoogleSignInButton next={next} onBusy={setRedirecting} />
        </div>

        <div className="auth-divider">or</div>

        {mode === "email" ? (
          <form onSubmit={onEmailSignIn} className="auth-stack">
            <input className="auth-field" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="auth-field" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button className="auth-btn auth-btn--primary" type="submit" disabled={busy}>Continue with Email</button>
          </form>
        ) : (
          <form onSubmit={onMagicLink} className="auth-stack">
            <input className="auth-field" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="auth-btn auth-btn--primary" type="submit" disabled={busy}>Email me a magic link</button>
          </form>
        )}

        <p className="auth-foot">
          {mode === "email" ? (
            <>Prefer no password? <button type="button" className="auth-link" onClick={() => { setMode("magic"); setStatus(null); }}>Use a magic link</button></>
          ) : (
            <>Have a password? <button type="button" className="auth-link" onClick={() => { setMode("email"); setStatus(null); }}>Sign in with password</button></>
          )}
        </p>
        {mode === "email" ? (
          <p className="auth-foot" style={{ marginTop: 6 }}>
            <button type="button" className="auth-link" disabled={busy} onClick={() => email ? run(() => auth.resetPassword(email), "Password reset email sent.") : setStatus({ type: "error", message: "Enter your email first." })}>Forgot your password?</button>
          </p>
        ) : null}

        {status && <p className={`auth-msg auth-msg--${status.type}`}>{status.message}</p>}

        <p className="auth-foot">New to Samorah? <a href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</a></p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense><LoginInner /></Suspense>
  );
}
