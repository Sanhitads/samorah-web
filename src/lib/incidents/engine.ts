/**
 * Incident rule engine — PURE, deterministic logic (no DB, no AI). Kept separate from the
 * orchestration service so the correlation rules can be unit-tested exhaustively:
 * severity inheritance, threshold firing, reason matching, merge decisions, auto-resolution.
 */
import {
  ROOT_CAUSE_RULES, HEALTH_THRESHOLDS, CATEGORY_SUBSYSTEM,
  type IncidentRule, type IncidentSeverity, type IncidentStatus, type IncidentCategory,
  type RootCauseSystem, type Subsystem, type HealthState, type EscalationLevel,
} from "@/config/incidents";

const SEV_RANK: Record<IncidentSeverity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

export function severityRank(s: IncidentSeverity): number {
  return SEV_RANK[s] ?? 0;
}

/** Severity inherits from the HIGHEST-severity attached notification (spec requirement). */
export function highestSeverity(list: IncidentSeverity[]): IncidentSeverity {
  if (!list.length) return "info";
  return list.reduce((best, s) => (severityRank(s) > severityRank(best) ? s : best), "info" as IncidentSeverity);
}

/** A rule fires when it is enabled and the windowed match count reaches its threshold. */
export function ruleTriggered(matchCount: number, rule: IncidentRule): boolean {
  return rule.enabled && matchCount >= rule.threshold;
}

/** Root-cause filter — case-insensitive regex against the failure reason (or always true). */
export function matchesReason(text: string | null | undefined, pattern?: string): boolean {
  if (!pattern) return true;
  try { return new RegExp(pattern, "i").test(text ?? ""); } catch { return false; }
}

/** Stable notification key for an affected item (matches the notification center's keys). */
export function deriveAlertKey(rule: IncidentRule, ref: string): string {
  return `${rule.alertKeyPrefix}:${ref}`;
}

export function isActiveStatus(status: IncidentStatus): boolean {
  return status === "open" || status === "investigating" || status === "mitigated";
}

/** Merge decision (spec): attach to an existing OPEN incident of the same category+rule when
 *  it's still inside the merge window, instead of opening a duplicate. */
export function shouldMergeInto(
  existing: { category: string; ruleId: string | null; status: IncidentStatus; lastActivityAt: string },
  rule: IncidentRule,
  nowMs: number,
): boolean {
  if (existing.category !== rule.category || existing.ruleId !== rule.id) return false;
  if (!isActiveStatus(existing.status)) return false;
  return nowMs - new Date(existing.lastActivityAt).getTime() <= rule.mergeWindowMinutes * 60_000;
}

/** An incident auto-resolves when it has notifications and every one is resolved (spec). */
export function allNotificationsResolved(notifs: { resolvedAt: string | null }[]): boolean {
  return notifs.length > 0 && notifs.every((n) => n.resolvedAt != null);
}

/** Free-text search predicate (Phase 2) — case-insensitive substring across an incident's own
 *  text fields. Order/customer matches are resolved separately in the service (they need the DB);
 *  this covers ID / title / root cause / gateway / team / assignee / owner. Pure & testable. */
export function matchesIncidentSearch(
  fields: (string | null | undefined)[],
  term: string,
): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return fields.some((v) => (v ?? "").toLowerCase().includes(t));
}

/** Display formatter for an incident number from a sequence value (DB generates the real one). */
export function formatIncidentNumber(seq: number): string {
  return `INC-${String(seq).padStart(5, "0")}`;
}

/** Human title for a freshly-opened incident. */
export function incidentTitle(rule: IncidentRule, count: number): string {
  return `${rule.title} (${count})`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 — Operations Intelligence (all deterministic + explainable; no AI)
// ═══════════════════════════════════════════════════════════════════════════════

/** ROOT CAUSE DETECTION — attribute an incident to a concrete upstream system. Returns the
 *  matched system AND the signal that matched it, so the UI can always explain "why". */
export function classifyRootCause(input: { sourceSystem?: string | null; category?: string | null; reason?: string | null }): { system: RootCauseSystem; why: string } {
  const src = (input.sourceSystem ?? "").toLowerCase();
  const reason = input.reason ?? "";
  for (const rule of ROOT_CAUSE_RULES) {
    if (rule.sourceSystems?.some((s) => s.toLowerCase() === src) && src) return { system: rule.system, why: `source system = ${input.sourceSystem}` };
    if (rule.categories?.includes(input.category as IncidentCategory)) return { system: rule.system, why: `category = ${input.category}` };
    if (rule.reason && reason && matchesReason(reason, rule.reason)) return { system: rule.system, why: `reason matched /${rule.reason}/i` };
  }
  return { system: "unknown", why: "no matching signal" };
}

/** HEALTH — a subsystem's state from its currently-active incidents. Explainable. */
export function subsystemHealth(active: { severity: IncidentSeverity; startedAt: string }[], nowMs: number): { state: HealthState; why: string } {
  if (!active.length) return { state: "healthy", why: "no active incidents" };
  const crit = active.filter((i) => i.severity === "critical").length;
  const high = active.filter((i) => i.severity === "high").length;
  if (crit > 0) return { state: "critical", why: `${crit} critical incident${crit === 1 ? "" : "s"}` };
  if (active.length >= HEALTH_THRESHOLDS.criticalCount) return { state: "critical", why: `${active.length} active incidents (≥ ${HEALTH_THRESHOLDS.criticalCount})` };
  const oldestMin = active.reduce((m, i) => Math.max(m, (nowMs - new Date(i.startedAt).getTime()) / 60000), 0);
  if (high > 0) return { state: "warning", why: `${high} high-severity incident${high === 1 ? "" : "s"}` };
  if (oldestMin >= HEALTH_THRESHOLDS.warnMinutes) return { state: "warning", why: `oldest open ${Math.round(oldestMin)} min (≥ ${HEALTH_THRESHOLDS.warnMinutes})` };
  return { state: "warning", why: `${active.length} active incident${active.length === 1 ? "" : "s"}` };
}

/** Overall health = worst of the subsystem states. */
export function overallHealth(states: HealthState[]): HealthState {
  if (states.includes("critical")) return "critical";
  if (states.includes("warning")) return "warning";
  return "healthy";
}

/** ESCALATION — which policy levels are now due for an unresolved incident (beyond its current
 *  level). Time-based + deterministic; the service records each with its reason. */
export function dueEscalations(ageMinutes: number, currentLevel: number, policy: EscalationLevel[]): EscalationLevel[] {
  return policy.filter((l) => l.level > currentLevel && ageMinutes >= l.afterMinutes);
}

/** RELATED INCIDENTS — deterministic resemblance score (0–1) with the reasons that produced it.
 *  Category 0.4 · root-cause system 0.4 · source system 0.2. */
export function resemblance(
  a: { category?: string | null; rootCauseSystem?: string | null; sourceSystem?: string | null },
  b: { category?: string | null; rootCauseSystem?: string | null; sourceSystem?: string | null },
): { score: number; reasons: string[] } {
  let score = 0; const reasons: string[] = [];
  if (a.category && a.category === b.category) { score += 0.4; reasons.push(`same category (${a.category})`); }
  if (a.rootCauseSystem && a.rootCauseSystem === b.rootCauseSystem) { score += 0.4; reasons.push(`same root cause (${a.rootCauseSystem})`); }
  if (a.sourceSystem && a.sourceSystem === b.sourceSystem) { score += 0.2; reasons.push(`same source (${a.sourceSystem})`); }
  return { score: Math.round(score * 100) / 100, reasons };
}

/** CROSS-SYSTEM CORRELATION — two active incidents sharing a root-cause system belong to one
 *  group when they started within the correlation window (the cascade → ONE incident). */
export function withinCorrelationWindow(startedAMs: number, startedBMs: number, windowMinutes: number): boolean {
  return Math.abs(startedAMs - startedBMs) <= windowMinutes * 60_000;
}

// ── ANALYTICS math (pure) ──────────────────────────────────────────────────────
export function minutesBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000;
}
export function meanMinutes(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n) && n >= 0);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}
/** Count occurrences by key → sorted [key, count] descending (Top Incident Types / Root Causes). */
export function topBy<T>(rows: T[], key: (r: T) => string | null | undefined, limit = 10): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}
export function categorySubsystem(category: string): Subsystem {
  return CATEGORY_SUBSYSTEM[category as IncidentCategory] ?? "checkout";
}
