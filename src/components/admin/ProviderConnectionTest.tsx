"use client";
import { useState } from "react";
import type { ConnectionResult } from "@/lib/settings/connectionTest";
import type { IntegrationSeverity } from "@/lib/settings/integrationRegistry";

/**
 * Razorpay connection test (Settings · Phase S2B) — a READ-ONLY "Test connection" action. Calls the existing
 * `POST /api/admin/settings/test-connection?provider=razorpay` (which reuses razorpaySettlementService — no
 * side effects) and renders the result using the SAME Healthy/Warning/Critical/Unknown severity language +
 * frozen diagnostic model as the S1A integration panels. No editable keys; env is the only source of truth.
 */
const ICON: Record<IntegrationSeverity, string> = { healthy: "✓", warning: "⚠", critical: "⛔", unknown: "•" };

export function ProviderConnectionTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null); setResult(null);
    try {
      const res = await fetch("/api/admin/settings/test-connection?provider=razorpay", { method: "POST" });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) { setErr(d.error ?? "Test failed."); return; }
      setResult(d as ConnectionResult);
    } catch { setBusy(false); setErr("Network error — try again."); }
  };

  return (
    <div className="int-test">
      <button type="button" className="ff-btn" disabled={busy} onClick={run}>{busy ? "Testing…" : "Test Razorpay connection"}</button>
      {err ? <span className="ff-err" role="alert">{err}</span> : null}
      {result ? (
        <span className="int-conn" data-sev={result.severity} role="status">
          {ICON[result.severity]} {result.label}{result.recommendedAction ? ` — ${result.recommendedAction}` : ""}
        </span>
      ) : null}
    </div>
  );
}
