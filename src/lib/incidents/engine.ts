/**
 * Incident rule engine — PURE, deterministic logic (no DB, no AI). Kept separate from the
 * orchestration service so the correlation rules can be unit-tested exhaustively:
 * severity inheritance, threshold firing, reason matching, merge decisions, auto-resolution.
 */
import type { IncidentRule, IncidentSeverity, IncidentStatus } from "@/config/incidents";

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
