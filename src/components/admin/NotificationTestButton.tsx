"use client";
import { useState } from "react";

/**
 * Test-notification action (Settings · S1A). Reuses the EXISTING endpoint
 * `POST /api/admin/notifications/test` (the single test flow — no parallel implementation) and clearly
 * displays which channels succeeded / failed / were skipped from the returned per-channel `results`.
 */
interface TestResult { channel: string; status: "sent" | "failed" | "skipped"; error?: string }

export function NotificationTestButton() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null); setResults(null);
    try {
      const res = await fetch("/api/admin/notifications/test", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) { setErr(d.error ?? "Failed"); return; }
      setResults((d.results ?? []) as TestResult[]);
    } catch { setBusy(false); setErr("Network error"); }
  };

  return (
    <div className="int-test">
      <button type="button" className="ff-btn" disabled={busy} onClick={run}>
        {busy ? "Testing…" : "Send test notification"}
      </button>
      {err ? <span className="ff-err">{err}</span> : null}
      {results ? (
        <ul className="int-test__results">
          {results.length === 0 ? <li data-r="skipped">Suppressed (deduped) — no channels fired.</li> : results.map((r, i) => (
            <li key={i} data-r={r.status}>
              {r.channel}: {r.status === "sent" ? "ok" : r.status === "skipped" ? "skipped" : (r.error ?? "failed")}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
