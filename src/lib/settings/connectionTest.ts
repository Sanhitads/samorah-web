/**
 * Provider connection-test mapping (Admin Settings · Phase S2B) — pure. REUSES the frozen S1A integration
 * architecture (diagnostic codes · severity model · Recommended Action Registry) — it does NOT introduce a
 * parallel status system. Maps a read-only provider probe outcome to the standard severity + a frozen
 * diagnostic code + its recommended action. No side effects, no I/O here.
 *
 * S2B implements Razorpay ONLY (read-only). Email test-send is intentionally deferred (real side effects);
 * notifications continue to use the existing S1A Notification Test.
 */
import { type DiagnosticCode, type IntegrationSeverity, recommendedAction } from "@/lib/settings/integrationRegistry";

/** The five distinguishable connection outcomes surfaced in the UI. */
export type ConnectionOutcome = "connected" | "auth_failed" | "config_missing" | "unavailable" | "timeout";

export interface ConnectionResult {
  outcome: ConnectionOutcome;
  label: string;                    // UI label (distinct per outcome)
  severity: IntegrationSeverity;    // reuses the frozen severity model
  diagnosticCode: DiagnosticCode;   // reuses the frozen diagnostic codes
  recommendedAction: string;        // reuses the frozen Recommended Action Registry ("" when connected)
}

/** Outcome → { label, severity, frozen diagnostic code }. Recommended action is looked up centrally. */
const OUTCOMES: Record<ConnectionOutcome, { label: string; severity: IntegrationSeverity; code: DiagnosticCode }> = {
  connected:      { label: "Connected",             severity: "healthy",  code: "OK" },
  auth_failed:    { label: "Authentication failed", severity: "critical", code: "CREDENTIALS_INVALID" },
  config_missing: { label: "Configuration missing", severity: "critical", code: "MISSING_ENV_VAR" },
  unavailable:    { label: "Provider unavailable",  severity: "warning",  code: "DEGRADED" },
  timeout:        { label: "Timeout",               severity: "warning",  code: "DEGRADED" },
};

export function connectionResult(outcome: ConnectionOutcome): ConnectionResult {
  const o = OUTCOMES[outcome];
  return {
    outcome,
    label: o.label,
    severity: o.severity,
    diagnosticCode: o.code,
    recommendedAction: o.severity === "healthy" ? "" : recommendedAction(o.code),
  };
}

/**
 * Interpret a read-only settlement-summary result (from `razorpaySettlementService`) into a connection
 * outcome. Pure — no I/O. `not_configured` → config missing; HTTP 401/403 → auth failed; other HTTP / network
 * error → unavailable; available with no error → connected.
 */
export function outcomeFromSettlement(r: { available: boolean; error?: string } | null): ConnectionOutcome {
  if (!r) return "unavailable";
  const e = r.error;
  if (e === "not_configured") return "config_missing";
  if (e === "http_401" || e === "http_403") return "auth_failed";
  if (e) return "unavailable"; // other HTTP status or network/other error
  return r.available ? "connected" : "unavailable";
}
