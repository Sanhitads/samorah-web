"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";

// Functional-only styling — no design system yet.
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

type Status = { type: "error" | "info"; message: string } | null;

export default function RegisterPage() {
  const auth = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const { data, error } = await auth.signUp(email, password, fullName || undefined);
    setBusy(false);

    if (error) {
      setStatus({ type: "error", message: error.message });
      return;
    }
    // With email confirmation on, there's a user but no active session yet.
    setStatus({
      type: "info",
      message:
        data.user && !data.session
          ? "Account created — check your email to confirm."
          : "Account created and signed in.",
    });
  }

  return (
    <main style={wrap}>
      <h1>Create account</h1>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          style={input}
          type="text"
          placeholder="Full name"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <button style={btn} type="submit" disabled={busy}>
          Create account
        </button>
      </form>

      {status && (
        <p style={{ color: status.type === "error" ? "crimson" : "green", fontSize: 13 }}>
          {status.message}
        </p>
      )}

      <p style={{ fontSize: 13 }}>
        Already have an account? <a href="/login">Sign in</a>
      </p>
    </main>
  );
}
