/**
 * Integration Status Aggregator (Admin Settings · Phase S1A) — a PURE presentation-composition layer over
 * existing service health. It renders ONLY from the Integration Registry, executes the underlying source
 * lookups CONCURRENTLY (a single `Promise.allSettled` fan-out), and maps each service's EXISTING status into
 * the standard severity model. It never computes health, never derives business state, never replaces service
 * ownership, and never caches a health copy. One integration failing/slow degrades ONLY its own panel.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSystemHealth, type HealthCheck } from "@/services/healthService";
import { getChannelHealth, type ChannelHealth } from "@/lib/notifications/opsEngine";
import { getEmailDeliveryHealth, type EmailHealth } from "@/services/emailDeliveryService";
import { IMPLEMENTED_EMAIL_TYPES } from "@/lib/email";
import { analyticsConfig, hasGa4 } from "@/lib/analytics/config";
import {
  SETTINGS_INTEGRATIONS, INTEGRATION_IDS, recommendedAction, severityFromHealthStatus,
  severityFromChannelState, worstSeverity, severityRank,
  type IntegrationId, type OwningModule, type IntegrationSeverity, type DiagnosticCode, type IntegrationDeclaration,
} from "@/lib/settings/integrationRegistry";

export interface IntegrationStatus {
  id: IntegrationId;
  provider: string;
  owningModule: OwningModule;
  severity: IntegrationSeverity;
  diagnosticCode: DiagnosticCode;
  reason: string;              // the primary diagnostic reason (service `detail` where available)
  recommendedAction: string;   // from the central lookup; "" when healthy
  configurationSource: string; // provenance
  serviceOwner: string;        // provenance
  lastSuccessAt: string | null;
  timestampSource: string | null;
  extraIssues: number;         // additional issues beyond the primary diagnostic
}

interface Sources {
  health: HealthCheck[] | null;
  channels: ChannelHealth[] | null;
  emailHealth: Record<string, EmailHealth> | null;
  lastWebhookAt: string | null;
}

const settled = <T>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);

function diagnosticFromHealth(check: HealthCheck | undefined): DiagnosticCode {
  if (!check) return "UNKNOWN";
  if (check.status === "ok") return "OK";
  if (check.status === "warn") return "DEGRADED";
  if (check.status === "off") {
    if (/webhook/i.test(check.detail)) return "WEBHOOK_SECRET_MISSING";
    return /not set/i.test(check.detail) ? "MISSING_ENV_VAR" : "PROVIDER_DISABLED";
  }
  return "UNKNOWN";
}

/** Pick the more severe of two health checks (the primary diagnostic driver). */
function worstCheck(a: HealthCheck | undefined, b: HealthCheck | undefined): HealthCheck | undefined {
  const sa = a ? severityFromHealthStatus(a.status) : "unknown";
  const sb = b ? severityFromHealthStatus(b.status) : "unknown";
  return severityRank(sb) > severityRank(sa) ? b : a;
}

function status(decl: IntegrationDeclaration, sev: IntegrationSeverity, code: DiagnosticCode, reason: string, lastSuccessAt: string | null, extraIssues: number): IntegrationStatus {
  return {
    id: decl.id, provider: decl.provider, owningModule: decl.owningModule,
    severity: sev, diagnosticCode: code, reason,
    recommendedAction: sev === "healthy" ? "" : recommendedAction(code),
    configurationSource: decl.configurationSource, serviceOwner: decl.serviceOwner,
    lastSuccessAt, timestampSource: decl.timestampSource,
    extraIssues: Math.max(0, extraIssues),
  };
}

function unknownStatus(decl: IntegrationDeclaration): IntegrationStatus {
  return status(decl, "unknown", "UNKNOWN", "Status unavailable.", null, 0);
}

const maxIso = (dates: (string | null)[]): string | null =>
  dates.filter(Boolean).sort().slice(-1)[0] ?? null;

/** Per-integration mappers — keyed by registry id. MUST cover exactly the registry ids (authority test). */
const MAPPERS: Record<IntegrationId, (decl: IntegrationDeclaration, s: Sources) => IntegrationStatus> = {
  analytics: (decl) => {
    const active = [analyticsConfig.ga4Id && "GA4", analyticsConfig.gtmId && "GTM", analyticsConfig.clarityId && "Clarity"].filter(Boolean) as string[];
    const ga4 = hasGa4();
    const sev: IntegrationSeverity = ga4 ? "healthy" : "warning";
    return status(decl, sev, ga4 ? "OK" : "MISSING_ENV_VAR",
      active.length ? `Active: ${active.join(", ")}` : "No analytics IDs configured (NEXT_PUBLIC_*).", null, 0);
  },
  payment: (decl, s) => {
    if (!s.health) return unknownStatus(decl);
    const pay = s.health.find((h) => h.name.startsWith("Payments"));
    const wh = s.health.find((h) => h.name === "Webhooks");
    const sev = worstSeverity([pay ? severityFromHealthStatus(pay.status) : "unknown", wh ? severityFromHealthStatus(wh.status) : "unknown"]);
    const primary = worstCheck(pay, wh);
    const issues = [pay, wh].filter((c) => c && c.status !== "ok").length;
    return status(decl, sev, diagnosticFromHealth(primary), primary?.detail ?? "Payment status unavailable.", s.lastWebhookAt, issues - 1);
  },
  email: (decl, s) => {
    if (!s.health) return unknownStatus(decl);
    const em = s.health.find((h) => h.name.startsWith("Email ("));
    const del = s.health.find((h) => h.name === "Email deliverability");
    const sev = worstSeverity([em ? severityFromHealthStatus(em.status) : "unknown", del ? severityFromHealthStatus(del.status) : "unknown"]);
    const primary = worstCheck(em, del);
    const issues = [em, del].filter((c) => c && c.status !== "ok").length;
    const lastSent = s.emailHealth ? maxIso(Object.values(s.emailHealth).map((h) => h.lastSentAt)) : null;
    return status(decl, sev, diagnosticFromHealth(primary), primary?.detail ?? "Email status unavailable.", lastSent, issues - 1);
  },
  notifications: (decl, s) => {
    if (!s.channels || !s.channels.length) return unknownStatus(decl);
    const sev = worstSeverity(s.channels.map((c) => severityFromChannelState(c.state)));
    const failing = s.channels.filter((c) => c.configured && (c.state === "failing" || c.state === "degraded"));
    const healthyCount = s.channels.filter((c) => c.state === "healthy").length;
    const code: DiagnosticCode = sev === "critical" || sev === "warning" ? "DEGRADED" : sev === "unknown" ? "UNKNOWN" : "OK";
    const reason = failing.length
      ? `${failing.map((c) => c.key).join(", ")} ${failing.length === 1 ? "channel" : "channels"} unhealthy`
      : `${healthyCount} channel${healthyCount === 1 ? "" : "s"} healthy`;
    return status(decl, sev, code, reason, maxIso(s.channels.map((c) => c.lastSuccessAt)), Math.max(0, failing.length - 1));
  },
};

/** The ids the aggregator can render — MUST equal the registry ids exactly (registry authority). */
export const MAPPED_INTEGRATION_IDS = Object.keys(MAPPERS) as IntegrationId[];

async function lastWebhookAt(): Promise<string | null> {
  try {
    const db = createAdminClient() as unknown as { from: (t: string) => { select: (q: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: { created_at: string }[] | null }> } } } };
    const { data } = await db.from("webhook_logs").select("created_at").order("created_at", { ascending: false }).limit(1);
    return data?.[0]?.created_at ?? null;
  } catch { return null; }
}

/** Race a source against a time bound; a slow/hanging source resolves to null (→ Unknown), never stalling. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => { t = setTimeout(() => resolve(null), ms); });
  return Promise.race([p.then((v) => v).finally(() => clearTimeout(t)), timeout]);
}

/** Documented default per-source time bound. */
export const DEFAULT_INTEGRATION_TIMEOUT_MS = 4000;
/** Resolve the per-source timeout: a valid positive `SETTINGS_INTEGRATION_TIMEOUT_MS`, else the default.
 *  Missing / non-numeric / 0 / negative all fall back to the documented default. */
export function resolveIntegrationTimeoutMs(): number {
  const n = Number(process.env.SETTINGS_INTEGRATION_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTEGRATION_TIMEOUT_MS;
}

/** Compose the integration statuses. Registry-driven, concurrent, per-panel isolated + time-bounded
 *  (a failing OR slow/hanging source → Unknown for only its panel; the others still render). */
export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const timeoutMs = resolveIntegrationTimeoutMs();
  const [healthR, channelsR, emailR, webhookR] = await Promise.allSettled([
    withTimeout(getSystemHealth(), timeoutMs),
    withTimeout(getChannelHealth(), timeoutMs),
    withTimeout(getEmailDeliveryHealth(IMPLEMENTED_EMAIL_TYPES as unknown as string[]), timeoutMs),
    withTimeout(lastWebhookAt(), timeoutMs),
  ]);
  const sources: Sources = {
    health: settled(healthR),
    channels: settled(channelsR),
    emailHealth: settled(emailR),
    lastWebhookAt: settled(webhookR),
  };
  return SETTINGS_INTEGRATIONS.map((decl) => {
    try { return MAPPERS[decl.id](decl, sources); }
    catch { return unknownStatus(decl); }
  });
}

export interface IntegrationSummary { healthy: number; warning: number; critical: number; unknown: number; total: number }
export function summarizeIntegrations(statuses: IntegrationStatus[]): IntegrationSummary {
  const c = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
  for (const s of statuses) c[s.severity]++;
  return { ...c, total: statuses.length };
}

export interface LaunchReadinessItem { id: IntegrationId; label: string; severity: IntegrationSeverity; ok: boolean }
/** Launch Readiness — derived ENTIRELY from the integration statuses (existing health only; no manual values). */
export function launchReadiness(statuses: IntegrationStatus[]): LaunchReadinessItem[] {
  return statuses.map((s) => ({ id: s.id, label: `${s.provider} · ${s.owningModule}`, severity: s.severity, ok: s.severity === "healthy" }));
}

export interface EnvironmentInfo { environment: "Production" | "Preview / Staging" | "Development"; commit: string | null }
/** Read-only operational environment + existing build metadata (no new versioning mechanism). */
export function getEnvironmentInfo(): EnvironmentInfo {
  const v = process.env.VERCEL_ENV;
  const environment: EnvironmentInfo["environment"] =
    v === "production" ? "Production" : v === "preview" ? "Preview / Staging" : process.env.NODE_ENV === "production" ? "Production" : "Development";
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return { environment, commit: sha ? sha.slice(0, 7) : null };
}
