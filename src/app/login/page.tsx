"use client";

import {
  Suspense,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUserStore } from "@/store/useUserStore";

// Functional-only styling — no design system yet (Phase 5.5 SDD comes later).
const wrap: CSSProperties = {
  maxWidth: 400,
  margin: "80px auto",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const input: CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
};
const btn: CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #222",
  background: "#222",
  color: "#fff",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};
const btnGhost: CSSProperties = { ...btn, background: "transparent", color: "#222" };

type Status = { type: "error" | "info"; message: string } | null;

function LoginInner() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const user = useUserStore((s) => s.user);
  const role = useUserStore((s) => s.role);
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  // Once authenticated, return to the path the middleware stashed in ?next=
  // (relative paths only, to avoid open redirects).
  useEffect(() => {
    if (isLoggedIn && next && next.startsWith("/")) {
      router.replace(next);
    }
  }, [isLoggedIn, next, router]);

  async function run(
    action: () => Promise<{ error: { message: string } | null }>,
    ok?: string,
  ) {
    setBusy(true);
    setStatus(null);
    const { error } = await action();
    setBusy(false);
    if (error) setStatus({ type: "error", message: error.message });
    else if (ok) setStatus({ type: "info", message: ok });
  }

  async function onPasswordSignIn(e: FormEvent) {
    e.preventDefault();
    await run(() => auth.signInWithPassword(email, password), "Signed in.");
  }

  function requireEmail(): boolean {
    if (email) return true;
    setStatus({ type: "error", message: "Enter your email first." });
    return false;
  }

  if (isLoggedIn && user) {
    return (
      <main style={wrap}>
        <h1>Account</h1>
        <p>
          Signed in as <strong>{user.email}</strong> ({role})
        </p>
        <button style={btn} disabled={busy} onClick={() => run(() => auth.signOut())}>
          Sign out
        </button>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h1>Sign in</h1>

      <form onSubmit={onPasswordSignIn} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          style={input}
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          style={input}
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button style={btn} type="submit" disabled={busy}>
          Sign in
        </button>
      </form>

      <button
        style={btnGhost}
        disabled={busy}
        onClick={() => requireEmail() && run(() => auth.signInWithMagicLink(email), "Magic link sent — check your email.")}
      >
        Email me a magic link
      </button>

      <button
        style={btnGhost}
        disabled={busy}
        onClick={() => requireEmail() && run(() => auth.resetPassword(email), "Password reset email sent.")}
      >
        Forgot password?
      </button>

      <button
        style={btnGhost}
        disabled={busy}
        onClick={() => run(() => auth.signInWithGoogle())}
      >
        Continue with Google (setup pending)
      </button>

      {status && (
        <p style={{ color: status.type === "error" ? "crimson" : "green", fontSize: 13 }}>
          {status.message}
        </p>
      )}

      <p style={{ fontSize: 13 }}>
        No account? <a href="/register">Register</a>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
