"use client";

/** Root error boundary — catches errors in the root layout itself. Must render
 *  its own <html>/<body> since it replaces the whole tree. Kept minimal + inline
 *  (no dependency on app CSS, which may be what failed). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "Georgia, serif", background: "#faf7f2", color: "#1f1a16", padding: 24, textAlign: "center" }}>
        <p style={{ fontFamily: "Arial, sans-serif", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#c9a96e", margin: 0 }}>Something went wrong</p>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 400, margin: 0 }}>A quiet stumble.</h1>
        <p style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: "#6b6259", maxWidth: 420, lineHeight: 1.6 }}>
          {error?.digest ? `Reference: ${error.digest}. ` : ""}Please try again.
        </p>
        <button type="button" onClick={reset} style={{ padding: "12px 28px", background: "#1f1a16", color: "#faf7f2", border: "none", fontFamily: "Arial, sans-serif", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>Try again</button>
      </body>
    </html>
  );
}
