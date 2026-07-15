/**
 * Incident rule engine — PURE, deterministic logic (no DB, no AI). Kept separate from the
 * orchestration service so the correlation rules can be unit-tested exhaustively:
 * severity inheritance, threshold firing, reason matching, merge decisions, auto-resolution.
 */
import {
  ROOT_CAUSE_RULES, HEALTH_THRESHOLDS, CATEGORY_SUBSYSTEM,
  CONFIDENCE_WEIGHTS, PRIORITY_MATRIX, IMPACT_THRESHOLDS, SLA_TARGETS_MIN, DYNAMIC_THRESHOLDS,
  BUSINESS_CALENDAR, MIN_EFFECTIVE_THRESHOLD, AUTO_ASSIGNMENT_RULES, COST_MODEL, DEPENDENCY_EDGES,
  type IncidentRule, type IncidentSeverity, type IncidentStatus, type IncidentCategory,
  type RootCauseSystem, type Subsystem, type HealthState, type EscalationLevel,
  type IncidentPriority, type ImpactLevel, type AutoAssignRule, type CalendarPeriod, type DepNode,
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

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4 — Enterprise Readiness (all deterministic + explainable; no AI)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConfidenceReason { factor: string; detail: string; points: number }
/** CONFIDENCE SCORE — how sure the engine is (0–100), with the points broken out per factor. */
export function computeConfidence(input: { eventCount: number; threshold: number; reasonMatched: boolean; rootCauseSystem?: string | null; windowMinutes: number; spanMinutes?: number | null }): { score: number; reasons: ConfidenceReason[] } {
  const W = CONFIDENCE_WEIGHTS;
  const reasons: ConfidenceReason[] = [{ factor: "rule_fired", detail: "A correlation rule matched", points: W.base }];
  let score = W.base;
  const over = Math.max(0, input.eventCount - input.threshold);
  const volume = Math.min(W.eventsCap, over * W.perEventOverThreshold);
  if (volume > 0) { score += volume; reasons.push({ factor: "event_volume", detail: `${over} event(s) over threshold`, points: volume }); }
  if (input.reasonMatched) { score += W.reasonMatched; reasons.push({ factor: "reason_matched", detail: "Failure reason matched the rule pattern", points: W.reasonMatched }); }
  if (input.rootCauseSystem && input.rootCauseSystem !== "unknown") { score += W.knownRootCause; reasons.push({ factor: "known_root_cause", detail: `Attributed to ${input.rootCauseSystem}`, points: W.knownRootCause }); }
  if (input.spanMinutes != null && input.windowMinutes > 0 && input.spanMinutes <= input.windowMinutes / 2) { score += W.tightWindow; reasons.push({ factor: "tight_window", detail: "Events clustered in a tight burst", points: W.tightWindow }); }
  return { score: Math.min(100, score), reasons };
}

/** PRIORITY — business impact bucket from affected orders, then Priority = matrix(severity, impact). */
export function impactLevelFromOrders(orders: number): ImpactLevel {
  if (orders >= IMPACT_THRESHOLDS.high) return "high";
  if (orders >= IMPACT_THRESHOLDS.medium) return "medium";
  if (orders >= IMPACT_THRESHOLDS.low) return "low";
  return "none";
}
export function priorityFrom(severity: IncidentSeverity, impact: ImpactLevel): IncidentPriority {
  return PRIORITY_MATRIX[severity][impact];
}
/** A priority "floor" from a template may not weaken the computed priority (p1 < p2 numerically). */
export function applyPriorityFloor(computed: IncidentPriority, floor?: IncidentPriority): IncidentPriority {
  if (!floor) return computed;
  return Number(computed[1]) <= Number(floor[1]) ? computed : floor;
}

export type SlaStatus = "none" | "on_track" | "at_risk" | "breached" | "met";
/** SLA — status + minutes remaining (negative = overdue). At-risk within 10 min of the due time. */
export function slaStatus(dueAtIso: string | null, resolvedAtIso: string | null, nowMs: number): { status: SlaStatus; remainingMin: number | null } {
  if (!dueAtIso) return { status: "none", remainingMin: null };
  const due = new Date(dueAtIso).getTime();
  if (resolvedAtIso) { const r = new Date(resolvedAtIso).getTime(); return { status: r <= due ? "met" : "breached", remainingMin: Math.round((due - r) / 60000) }; }
  const remaining = (due - nowMs) / 60000;
  if (remaining < 0) return { status: "breached", remainingMin: Math.round(remaining) };
  return { status: remaining <= 10 ? "at_risk" : "on_track", remainingMin: Math.round(remaining) };
}
export function slaTargetFor(priority: IncidentPriority): number { return SLA_TARGETS_MIN[priority]; }

/** DYNAMIC THRESHOLDS — the time context (in configured tz) that decides the threshold multiplier. */
export function timeContext(nowMs: number): "businessHours" | "offHours" | "weekend" {
  const cfg = DYNAMIC_THRESHOLDS;
  const d = new Date(nowMs + cfg.timezoneOffsetMin * 60000);
  const day = d.getUTCDay(), hour = d.getUTCHours();
  if (!cfg.businessHours.days.includes(day)) return "weekend";
  return hour >= cfg.businessHours.startHour && hour < cfg.businessHours.endHour ? "businessHours" : "offHours";
}
export function activeCalendarPeriod(nowMs: number): CalendarPeriod | null {
  for (const p of BUSINESS_CALENDAR) { if (nowMs >= new Date(p.startsAt).getTime() && nowMs <= new Date(p.endsAt).getTime()) return p; }
  return null;
}
/** Effective threshold = base × (calendar override, else time-context multiplier), floored. Explainable. */
export function effectiveThreshold(base: number, nowMs: number): { threshold: number; multiplier: number; context: string; severityBoost: number } {
  const cal = activeCalendarPeriod(nowMs);
  if (cal) return { threshold: Math.max(MIN_EFFECTIVE_THRESHOLD, Math.round(base * cal.thresholdMultiplier)), multiplier: cal.thresholdMultiplier, context: cal.name, severityBoost: cal.severityBoost };
  if (!DYNAMIC_THRESHOLDS.enabled) return { threshold: base, multiplier: 1, context: "static", severityBoost: 0 };
  const ctx = timeContext(nowMs);
  const mult = DYNAMIC_THRESHOLDS.multipliers[ctx];
  return { threshold: Math.max(MIN_EFFECTIVE_THRESHOLD, Math.round(base * mult)), multiplier: mult, context: ctx, severityBoost: 0 };
}
/** Bump a severity up N ranks (business-calendar severity boost). */
export function boostSeverity(severity: IncidentSeverity, boost: number): IncidentSeverity {
  if (boost <= 0) return severity;
  const order: IncidentSeverity[] = ["info", "low", "medium", "high", "critical"];
  const idx = Math.min(order.length - 1, order.indexOf(severity) + boost);
  return order[idx];
}

/** ADVANCED AUTO-ASSIGNMENT — first matching rule wins (ordered). Returns the rule (with its label). */
export function matchAutoAssign(ctx: { category: string; rootCauseSystem?: string | null; revenue?: number; severity: IncidentSeverity }): AutoAssignRule | null {
  for (const rule of AUTO_ASSIGNMENT_RULES) {
    const w = rule.when;
    if (w.category && w.category !== ctx.category) continue;
    if (w.rootCauseSystem && w.rootCauseSystem !== ctx.rootCauseSystem) continue;
    if (w.minRevenue != null && (ctx.revenue ?? 0) < w.minRevenue) continue;
    if (w.minSeverity && severityRank(ctx.severity) < severityRank(w.minSeverity)) continue;
    return rule;
  }
  return null;
}

/** COST OF INCIDENT — deterministic estimate with the parts broken out (management metric). */
export function estimateCost(input: { revenue: number; refundValue: number; shipmentsDelayed: number; slaBreached: boolean; ageHours: number }): { total: number; parts: Record<string, number> } {
  const m = COST_MODEL;
  const parts = {
    revenueAtRisk: Math.round(input.revenue * m.revenueAtRiskPct),
    refunds: Math.round(input.refundValue * m.refundWeight),
    delayedShipments: input.shipmentsDelayed * m.perDelayedShipment,
    slaPenalty: input.slaBreached ? m.slaBreachPenalty : 0,
    opsLabour: Math.round(Math.max(0, input.ageHours) * m.opsCostPerHour),
  };
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

/** SUPPRESSION — does an operator rule silence this signature right now? */
export function suppressionMatches(rule: { enabled: boolean; category?: string | null; subsystem?: string | null; root_cause_system?: string | null; reason_pattern?: string | null; starts_at?: string | null; ends_at?: string | null }, ctx: { category: string; subsystem?: string | null; rootCauseSystem?: string | null; reason?: string | null }, nowMs: number): boolean {
  if (!rule.enabled) return false;
  if (rule.starts_at && nowMs < new Date(rule.starts_at).getTime()) return false;
  if (rule.ends_at && nowMs > new Date(rule.ends_at).getTime()) return false;
  if (rule.category && rule.category !== ctx.category) return false;
  if (rule.subsystem && rule.subsystem !== ctx.subsystem) return false;
  if (rule.root_cause_system && rule.root_cause_system !== ctx.rootCauseSystem) return false;
  if (rule.reason_pattern && !matchesReason(ctx.reason, rule.reason_pattern)) return false;
  return true;
}
/** MAINTENANCE WINDOW — is a system under maintenance right now (a scoped, time-boxed suppression)? */
export function maintenanceActive(win: { enabled: boolean; root_cause_system?: string | null; subsystem?: string | null; starts_at: string; ends_at: string }, ctx: { subsystem?: string | null; rootCauseSystem?: string | null }, nowMs: number): boolean {
  if (!win.enabled) return false;
  if (nowMs < new Date(win.starts_at).getTime() || nowMs > new Date(win.ends_at).getTime()) return false;
  if (win.root_cause_system && win.root_cause_system !== ctx.rootCauseSystem) return false;
  if (win.subsystem && win.subsystem !== ctx.subsystem) return false;
  return true;
}

/** DEPENDENCY GRAPH — downstream nodes reachable from a starting system (BFS over configured edges). */
export function dependencyDownstream(start: DepNode): DepNode[] {
  const adj = new Map<DepNode, DepNode[]>();
  for (const e of DEPENDENCY_EDGES) { if (!adj.has(e.from)) adj.set(e.from, []); adj.get(e.from)!.push(e.to); }
  const seen = new Set<DepNode>(), out: DepNode[] = [], q: DepNode[] = [start];
  while (q.length) { const n = q.shift()!; for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); out.push(m); q.push(m); } }
  return out;
}

/** ESCALATION COUNTDOWN — the next escalation level + when it fires (for the live timer). */
export function nextEscalationInfo(startedAtMs: number, currentLevel: number, policy: EscalationLevel[]): { level: number; notify: string; atMs: number } | null {
  const next = policy.find((l) => l.level > currentLevel);
  return next ? { level: next.level, notify: next.notify, atMs: startedAtMs + next.afterMinutes * 60000 } : null;
}
