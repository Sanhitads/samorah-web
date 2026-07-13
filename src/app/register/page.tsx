"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AuthLoader } from "@/components/auth/AuthFlame";

type Status = { type: "error" | "info"; message: string } | null;

function RegisterInner() {
  const auth = useAuth();
  const next = useSearchParams().get("next");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setStatus(null);
    const { data, error } = await auth.signUp(email, password, fullName || undefined);
    setBusy(false);
    if (error) { setStatus({ type: "error", message: error.message }); return; }
    setStatus({ type: "info", message: data.user && !data.session ? "Account created — check your email to confirm." : "Account created and signed in." });
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        {(busy || redirecting) && <AuthLoader label={redirecting ? "Redirecting to Google" : "Creating your account"} />}

        <div className="auth-brand"><div className="auth-brand__mark">SAMORAH</div><div className="auth-brand__sub">Join us</div></div>
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">One account for your cart, wishlist, rewards and orders — on every device.</p>

        <div className="auth-stack">
          <GoogleSignInButton next={next} label="Sign up with Google" onBusy={setRedirecting} />
        </div>

        <div className="auth-divider">or</div>

        <form onSubmit={onSubmit} className="auth-stack">
          <input className="auth-field" type="text" placeholder="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <input className="auth-field" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="auth-field" type="password" placeholder="Password (min 6 characters)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <button className="auth-btn auth-btn--primary" type="submit" disabled={busy}>Create account</button>
        </form>

        {status && <p className={`auth-msg auth-msg--${status.type}`}>{status.message}</p>}

        <p className="auth-foot">Already have an account? <a href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in</a></p>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense><RegisterInner /></Suspense>
  );
}
