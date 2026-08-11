/**
 * Integration Registry (Admin Settings · Phase S1A) — the SINGLE source of truth for which operational
 * integrations the Settings page surfaces. The Integration Status Aggregator renders panels ONLY by
 * iterating this registry; no panel is hardcoded and no direct panel implementations are permitted.
 *
 * This module is PURE (no I/O, no service imports): it declares metadata + frozen diagnostic codes +
 * recommended-action lookup + the status→severity maps. All health TRUTH stays with the owning services
 * (`healthService`, `opsEngine`, `analyticsConfig`); the aggregator composes their existing outputs.
 *
 * Governance mirrors ADR 0006 (Registry-driven Navigation): single source of truth · registry-driven
 * composition · frozen identifiers · structural integrity tests · centralized ownership.
 */

/** Structural version of the registry. Any structural change (fields/contract) requires an increment. */
export const INTEGRATION_REGISTRY_VERSION = "v1";

/** Permanent integration ids — NEVER renamed; may only be deprecated. The durable key everything references. */
export type IntegrationId = "analytics" | "payment" | "email" | "notifications";
export type OwningModule = "Analytics" | "Payment" | "Email" | "Notifications";
export type IntegrationSeverity = "healthy" | "warning" | "critical" | "unknown";

/** Frozen diagnostic codes — stable identifiers (future audit/export/monitoring keys). Wording may change; codes may NOT. */
export type DiagnosticCode =
  | "OK"
  | "MISSING_ENV_VAR"
  | "WEBHOOK_SECRET_MISSING"
  | "PROVIDER_DISABLED"
  | "CREDENTIALS_INVALID"
  | "DEGRADED"
  | "NO_RECENT_ACTIVITY"
  | "UNKNOWN";

export interface IntegrationDeclaration {
  id: IntegrationId;
  provider: string;
  owningModule: OwningModule;
  healthSource: string;        // existing service call that yields status
  diagnosticsSource: string;   // where the diagnostic code is mapped from
  configurationSource: string; // provenance — where config lives ("Managed by Environment Variables")
  serviceOwner: string;        // provenance — which service owns this integration's truth
  timestampSource: string | null; // origin of "last successful communication" time, or null
  auditSource: string | null;
}

/** The registry (v1: Analytics · Payment · Email · Notifications). Add an integration = one entry here. */
export const SETTINGS_INTEGRATIONS: IntegrationDeclaration[] = [
  { id: "analytics", provider: "GA4 · GTM · Clarity", owningModule: "Analytics",
    healthSource: "analyticsConfig", diagnosticsSource: "analyticsConfig",
    configurationSource: "analyticsConfig (NEXT_PUBLIC_* env)", serviceOwner: "analyticsConfig",
    timestampSource: null, auditSource: null },
  { id: "payment", provider: "Razorpay", owningModule: "Payment",
    healthSource: "healthService.getSystemHealth", diagnosticsSource: "healthService.getSystemHealth",
    configurationSource: "commerce.ts · RAZORPAY (env)", serviceOwner: "healthService",
    timestampSource: "webhook_logs", auditSource: null },
  { id: "email", provider: "Resend", owningModule: "Email",
    healthSource: "healthService.getSystemHealth", diagnosticsSource: "healthService.getSystemHealth",
    configurationSource: "emailProvider (env)", serviceOwner: "healthService",
    timestampSource: "emailDeliveryService", auditSource: null },
  { id: "notifications", provider: "Slack · SMS · WhatsApp · Email · In-app", owningModule: "Notifications",
    healthSource: "opsEngine.getChannelHealth", diagnosticsSource: "opsEngine.getChannelHealth",
    configurationSource: "config/notifications.ts (env)", serviceOwner: "opsEngine",
    timestampSource: "opsEngine.getChannelHealth", auditSource: null },
];

/** All registered ids (the authority set — the aggregator must render exactly these). */
export const INTEGRATION_IDS: IntegrationId[] = SETTINGS_INTEGRATIONS.map((i) => i.id);

const BY_ID: Record<string, IntegrationDeclaration> = Object.fromEntries(SETTINGS_INTEGRATIONS.map((i) => [i.id, i]));
export function getIntegration(id: string): IntegrationDeclaration | undefined {
  return BY_ID[id];
}

/** Central Recommended-Action lookup — keyed by diagnostic code. Recommendation text lives ONLY here. */
export const RECOMMENDED_ACTIONS: Record<DiagnosticCode, string> = {
  OK: "",
  MISSING_ENV_VAR: "Set the required environment variable(s) for this provider.",
  WEBHOOK_SECRET_MISSING: "Configure the webhook secret so inbound events are verified.",
  PROVIDER_DISABLED: "Enable the provider by setting its credentials.",
  CREDENTIALS_INVALID: "Verify the provider credentials.",
  DEGRADED: "Recent failures detected — check the provider dashboard and logs.",
  NO_RECENT_ACTIVITY: "No recent successful activity — confirm the integration is live.",
  UNKNOWN: "Status unavailable — retry shortly.",
};

export function recommendedAction(code: DiagnosticCode): string {
  return RECOMMENDED_ACTIONS[code] ?? RECOMMENDED_ACTIONS.UNKNOWN;
}

// ── Severity maps (pure presentation mapping — NOT health computation) ──────────────────────────────
const SEVERITY_RANK: Record<IntegrationSeverity, number> = { unknown: 0, healthy: 1, warning: 2, critical: 3 };

/** `healthService` HealthStatus → severity. Unknown for anything unrecognised (graceful). */
export function severityFromHealthStatus(status: string): IntegrationSeverity {
  switch (status) {
    case "ok": return "healthy";
    case "warn": return "warning";
    case "off":
    case "down": return "critical";
    default: return "unknown";
  }
}

/** `opsEngine` ChannelState → severity. Dormant (intentionally off) is neutral (unknown, never worsens). */
export function severityFromChannelState(state: string): IntegrationSeverity {
  switch (state) {
    case "healthy": return "healthy";
    case "degraded":
    case "maintenance":
    case "pending": return "warning";
    case "failing": return "critical";
    case "dormant": return "unknown";
    default: return "unknown";
  }
}

/** The most-severe severity present (critical > warning > healthy > unknown). Empty → unknown. */
export function worstSeverity(list: IntegrationSeverity[]): IntegrationSeverity {
  return list.reduce<IntegrationSeverity>((worst, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst), "unknown");
}

/** Numeric rank of a severity (for choosing the primary diagnostic among several). */
export function severityRank(s: IntegrationSeverity): number {
  return SEVERITY_RANK[s];
}
