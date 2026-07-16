/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Incident service — the DB-facing orchestration on top of the pure rule engine
 * (`lib/incidents/engine`). Correlates notifications into incidents, auto-resolves them, and
 * serves the incident list/detail/metrics. Deterministic, no AI. Notifications are untouched:
 * an incident references them by their stable `alert_key`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailConfigured } from "@/lib/email";
import { notifyOps } from "@/lib/notifications/opsEngine";
import type { OpsPayload } from "@/lib/notifications/opsTypes";
import type { OpsChannelKey, OpsEvent } from "@/config/notifications";
import {
  INCIDENT_RULES, INCIDENT_CATEGORY_LABEL, CATEGORY_TEAM, INCIDENT_CHECKLISTS,
  SUBSYSTEMS, SUBSYSTEM_LABEL, ROOT_CAUSE_LABEL, ESCALATION_POLICY, ESCALATION_MIN_SEVERITY, CROSS_SYSTEM_WINDOW_MIN,
  INCIDENT_RUNBOOKS, INCIDENT_TEMPLATES, PRIORITY_LABEL, IMPACT_LABEL, DEPENDENCY_NODES, DEPENDENCY_EDGES,
  type IncidentRule, type IncidentSeverity, type IncidentCategory, type Subsystem, type RootCauseSystem, type HealthState,
  type IncidentPriority, type ImpactLevel, type DepNode,
} from "@/config/incidents";
import {
  highestSeverity, ruleTriggered, matchesReason, shouldMergeInto, allNotificationsResolved, incidentTitle,
  matchesIncidentSearch, classifyRootCause, categorySubsystem, subsystemHealth, overallHealth, dueEscalations,
  resemblance, withinCorrelationWindow, minutesBetween, meanMinutes, topBy, severityRank,
  computeConfidence, impactLevelFromOrders, priorityFrom, applyPriorityFloor, slaStatus, slaTargetFor,
  effectiveThreshold, boostSeverity, matchAutoAssign, estimateCost, suppressionMatches, maintenanceActive,
  dependencyDownstream, nextEscalationInfo,
} from "@/lib/incidents/engine";

const db = () => createAdminClient() as any;

interface SourceRow { alertKey: string; orderNumber: string | null; reason: string | null; at: string | null }

/** Fetch failing rows for a rule's source table + derive the notification alert key per row.
 *  `sinceIso` set → windowed (correlation); omitted → current state (resolution). */
async function fetchRows(rule: IncidentRule, sinceIso?: string): Promise<SourceRow[]> {
  const client = db();
  const gte = (q: any) => (sinceIso ? q.gte("created_at", sinceIso) : q);
  try {
    if (rule.table === "refunds") {
      const { data } = await gte(client.from("refunds").select("id,error_description,reason,created_at,orders!inner(order_number)").eq(rule.statusColumn, rule.statusValue)).limit(500);
      return (data ?? []).map((r: any) => ({ alertKey: `${rule.alertKeyPrefix}:${r.orders?.order_number}`, orderNumber: r.orders?.order_number ?? null, reason: r.error_description || r.reason || null, at: r.created_at }));
    }
    if (rule.table === "payment_attempts") {
      const { data } = await gte(client.from("payment_attempts").select("id,razorpay_order_id,error_description,created_at,orders(order_number)").eq(rule.statusColumn, rule.statusValue)).limit(500);
      return (data ?? []).map((p: any) => { const ref = p.orders?.order_number ?? p.razorpay_order_id ?? p.id; return { alertKey: `${rule.alertKeyPrefix}:${ref}`, orderNumber: p.orders?.order_number ?? null, reason: p.error_description || null, at: p.created_at }; });
    }
    if (rule.table === "shipments") {
      const q = sinceIso ? client.from("shipments").select("id,order_number,exception_reason,updated_at").eq(rule.statusColumn, rule.statusValue).gte("updated_at", sinceIso) : client.from("shipments").select("id,order_number,exception_reason,updated_at").eq(rule.statusColumn, rule.statusValue);
      const { data } = await q.limit(500);
      return (data ?? []).map((s: any) => ({ alertKey: `${rule.alertKeyPrefix}:${s.id}`, orderNumber: s.order_number ?? null, reason: s.exception_reason || null, at: s.updated_at }));
    }
    if (rule.table === "notification_dispatches") {
      const { data } = await gte(client.from("notification_dispatches").select("id,created_at").eq(rule.statusColumn, rule.statusValue)).limit(500);
      return (data ?? []).map((d: any) => ({ alertKey: `${rule.alertKeyPrefix}:${d.id}`, orderNumber: null, reason: null, at: d.created_at }));
    }
  } catch { /* source unavailable → no rows */ }
  return [];
}

function dedupeByKey(rows: SourceRow[]): SourceRow[] {
  const seen = new Map<string, SourceRow>();
  for (const r of rows) if (!seen.has(r.alertKey)) seen.set(r.alertKey, r);
  return [...seen.values()];
}

async function addHistory(incidentId: string, event: string, detail: string, actor?: { id?: string | null; name?: string | null }): Promise<void> {
  try { await db().from("incident_history").insert({ incident_id: incidentId, event, detail, actor_id: actor?.id ?? null, actor_name: actor?.name ?? null }); } catch { /* non-fatal */ }
}

/** Recompute derived fields (counts, last activity; severity auto-inherits from the highest
 *  notification UNLESS a human has locked it via a manual severity change). Phase 4 also keeps the
 *  business-impact level + priority in sync (Priority = severity × impact). */
async function recompute(incidentId: string): Promise<void> {
  const [{ data: inc }, { data: notifs }] = await Promise.all([
    db().from("incidents").select("severity,severity_locked,category,started_at,sla_breached").eq("id", incidentId).maybeSingle(),
    db().from("incident_notifications").select("order_number,severity,resolved_at").eq("incident_id", incidentId),
  ]);
  const rows = (notifs ?? []) as any[];
  const open = rows.filter((n) => !n.resolved_at);
  const orders = new Set(rows.map((n) => n.order_number).filter(Boolean));
  const patch: any = { affected_notifications: rows.length, affected_orders: orders.size, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const severity: IncidentSeverity = inc?.severity_locked ? (inc.severity as IncidentSeverity) : highestSeverity((open.length ? open : rows).map((n) => (n.severity ?? "info") as IncidentSeverity));
  if (!inc?.severity_locked) patch.severity = severity;
  const impactLevel = impactLevelFromOrders(orders.size);
  patch.impact_level = impactLevel;
  // Priority = severity × impact, honouring the template floor — same rule as creation, so the two
  // never drift. Keep the SLA target/due in sync with the (possibly upgraded) priority.
  const priority = applyPriorityFloor(priorityFrom(severity, impactLevel), INCIDENT_TEMPLATES[inc?.category as IncidentCategory]?.priorityFloor);
  patch.priority = priority;
  const slaMin = slaTargetFor(priority);
  patch.sla_target_min = slaMin;
  if (!inc?.sla_breached && inc?.started_at) patch.sla_due_at = new Date(new Date(inc.started_at).getTime() + slaMin * 60000).toISOString();
  await db().from("incidents").update(patch).eq("id", incidentId);
}

/** Seed the configurable checklist template for a new incident's category (Phase 2). */
async function seedChecklist(incidentId: string, category: IncidentCategory): Promise<void> {
  const items = INCIDENT_CHECKLISTS[category];
  if (!items?.length) return;
  try { await db().from("incident_checklist_items").insert(items.map((label, i) => ({ incident_id: incidentId, label, sort_order: i }))); } catch { /* non-fatal */ }
}

export interface CorrelationResult { created: number; merged: number; attached: number; resolved: number; suppressed: number }

/**
 * A newly-opened incident is the authoritative signal that a SUBSYSTEM is down — map it to the
 * matching operational event so ops get paged through the notification engine (Slack, and SMS when
 * it's critical infra). Best-effort: alerting must never break correlation.
 */
async function emitIncidentOpened(number: string, category: string, rootCauseSystem: string, severity: IncidentSeverity, events: number, windowMin: number): Promise<void> {
  const EVENT_FOR: Record<string, OpsEvent | undefined> = {
    payment_gateway: "payment.gateway_down",
    inventory: "inventory.sync_failed",
    shipment: "shipment.delayed",
    email: "tech.error",
    refund: "refund.failed",
  };
  const opsEvent = EVENT_FOR[category];
  if (!opsEvent) return;
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  try {
    await notifyOps(opsEvent, {
      title: `${INCIDENT_CATEGORY_LABEL[category as IncidentCategory] ?? category} incident opened`,
      message: `${events} correlated failures within ${windowMin} min — incident ${number} is open.`,
      severity: severity === "critical" ? "critical" : "warning",
      fields: [
        { label: "Incident", value: number }, { label: "Root cause", value: ROOT_CAUSE_LABEL[rootCauseSystem as RootCauseSystem] ?? rootCauseSystem },
        { label: "Events", value: `${events} in ${windowMin}m` }, { label: "Severity", value: severity },
      ],
      url: base ? `${base}/admin/incidents/${number}` : undefined,
      entityType: "incident", entityRef: number,
    });
  } catch { /* alerting must never break correlation */ }
}

/** Seed the configurable runbook (guided workflow) for a new incident's category (Phase 4). */
async function seedRunbook(incidentId: string, category: IncidentCategory): Promise<void> {
  const steps = INCIDENT_RUNBOOKS[category];
  if (!steps?.length) return;
  try { await db().from("incident_runbook_steps").insert(steps.map((s, i) => ({ incident_id: incidentId, step_no: i + 1, title: s.title, instruction: s.instruction, action: s.action }))); } catch { /* non-fatal */ }
}
async function activeSuppressionRules(): Promise<any[]> {
  try { const { data } = await db().from("incident_suppression_rules").select("*").eq("enabled", true); return data ?? []; } catch { return []; }
}
async function activeMaintenanceWindows(nowMs: number): Promise<any[]> {
  try { const iso = new Date(nowMs).toISOString(); const { data } = await db().from("maintenance_windows").select("*").eq("enabled", true).lte("starts_at", iso).gte("ends_at", iso); return data ?? []; } catch { return []; }
}
/** ADVANCED AUTO-ASSIGNMENT — apply the first matching rule (team + optional role assignee). Logged. */
async function applyAutoAssignment(incidentId: string, ctx: { category: string; rootCauseSystem?: string | null; revenue?: number; severity: IncidentSeverity }): Promise<void> {
  const rule = matchAutoAssign(ctx);
  if (!rule) return;
  const patch: any = { team: rule.team, assignment_reason: rule.label, last_activity_at: touch() };
  let who: string | null = null;
  if (rule.assignRole) {
    const roles = rule.assignRole === "admin" ? ["admin", "super_admin"] : ["manager", "admin", "super_admin"];
    const { data } = await db().from("users").select("id,full_name").in("role", roles).order("full_name").limit(1);
    const u = (data ?? [])[0];
    if (u) { patch.assignee_id = u.id; patch.assignee_name = u.full_name ?? "Staff"; patch.owner_id = u.id; patch.owner_name = u.full_name ?? "Staff"; who = u.full_name ?? "Staff"; }
  }
  await db().from("incidents").update(patch).eq("id", incidentId);
  await addHistory(incidentId, "auto_assigned", `${rule.label} → ${who ?? rule.team}`);
}

/** Run every rule → open/merge incidents, then auto-resolve. Idempotent (merge prevents dupes).
 *  Phase 4: dynamic/calendar thresholds, suppression + maintenance gating, confidence, priority,
 *  SLA target, runbook seeding, and advanced auto-assignment on creation. */
export async function correlateIncidents(): Promise<CorrelationResult> {
  const now = Date.now();
  let created = 0, merged = 0, attached = 0, suppressed = 0;
  const [suppressions, maintenance] = await Promise.all([activeSuppressionRules(), activeMaintenanceWindows(now)]);

  for (const rule of INCIDENT_RULES) {
    if (!rule.enabled) continue;
    const since = new Date(now - rule.windowMinutes * 60_000).toISOString();
    const rows = (await fetchRows(rule, since)).filter((r) => matchesReason(r.reason, rule.reasonPattern));
    const eff = effectiveThreshold(rule.threshold, now);        // dynamic time-of-day + business calendar
    if (rows.length < eff.threshold) continue;                  // threshold (for the current context) not crossed

    const notifs = dedupeByKey(rows);
    const rc = classifyRootCause({ sourceSystem: rule.sourceSystem, category: rule.category, reason: rule.rootCauseLabel });
    const subsystem = categorySubsystem(rule.category);

    // Find an active incident of the same category+rule to merge into.
    const { data: existing } = await db().from("incidents").select("id,category,rule_id,status,last_activity_at").eq("category", rule.category).eq("rule_id", rule.id).eq("is_simulation", false).in("status", ["open", "investigating", "mitigated"]).order("last_activity_at", { ascending: false }).limit(1);
    const inc = (existing ?? [])[0];

    let incidentId: string;
    if (inc && shouldMergeInto({ category: inc.category, ruleId: inc.rule_id, status: inc.status, lastActivityAt: inc.last_activity_at }, rule, now)) {
      incidentId = inc.id; merged++;
    } else {
      // Suppression / maintenance gate — only blocks NEW incident creation, never existing ones.
      const supCtx = { category: rule.category, subsystem, rootCauseSystem: rc.system, reason: rule.rootCauseLabel };
      const sup = suppressions.find((s) => suppressionMatches(s, supCtx, now));
      const mw = maintenance.find((w) => maintenanceActive(w, supCtx, now));
      if (sup || mw) { suppressed++; continue; }                // silenced — do not open

      const times = notifs.map((n) => n.at).filter(Boolean).map((t) => new Date(t as string).getTime());
      const detectedAt = times.length ? new Date(Math.min(...times)).toISOString() : new Date().toISOString();
      const spanMinutes = times.length ? (Math.max(...times) - Math.min(...times)) / 60000 : 0;
      const severity = boostSeverity(rule.notificationSeverity, eff.severityBoost);
      const conf = computeConfidence({ eventCount: rows.length, threshold: eff.threshold, reasonMatched: !!rule.reasonPattern, rootCauseSystem: rc.system, windowMinutes: rule.windowMinutes, spanMinutes });
      const impactLevel = impactLevelFromOrders(new Set(notifs.map((n) => n.orderNumber).filter(Boolean)).size);
      const tmpl = INCIDENT_TEMPLATES[rule.category as IncidentCategory];
      const priority = applyPriorityFloor(priorityFrom(severity, impactLevel), tmpl.priorityFloor);
      const slaMin = slaTargetFor(priority);
      const { data: newInc } = await db().from("incidents").insert({
        title: incidentTitle(rule, notifs.length), category: rule.category, severity, status: "open",
        root_cause: rule.rootCauseLabel, source_system: rule.sourceSystem, rule_id: rule.id, team: CATEGORY_TEAM[rule.category as IncidentCategory],
        root_cause_system: rc.system, subsystem, detected_at: detectedAt,
        confidence: conf.score, confidence_reasons: conf.reasons, priority, impact_level: impactLevel,
        sla_target_min: slaMin, sla_due_at: new Date(now + slaMin * 60000).toISOString(),
        description: `Correlated by rule "${rule.id}" — ${rows.length} events within ${rule.windowMinutes} min (threshold ${eff.threshold}, ${eff.context}).`,
      }).select("id").single();
      incidentId = newInc.id;
      if (tmpl.seedChecklist) await seedChecklist(incidentId, rule.category as IncidentCategory);
      if (tmpl.seedRunbook) await seedRunbook(incidentId, rule.category as IncidentCategory);
      await addHistory(incidentId, "created", `Opened by rule ${rule.id} — ${rows.length} events in ${rule.windowMinutes}m`);
      await addHistory(incidentId, "root_cause_detected", `${ROOT_CAUSE_LABEL[rc.system]} — ${rc.why}`);
      await addHistory(incidentId, "confidence_scored", `${conf.score}% (${conf.reasons.map((r) => r.factor).join(", ")})`);
      if (eff.context !== "static" && eff.context !== "businessHours") await addHistory(incidentId, "threshold_context", `Effective threshold ${eff.threshold} — ${eff.context} ×${eff.multiplier}`);
      await addHistory(incidentId, "priority_set", `${PRIORITY_LABEL[priority]} (severity ${severity} × impact ${impactLevel}); SLA ${slaMin}m`);
      await applyAutoAssignment(incidentId, { category: rule.category, rootCauseSystem: rc.system, revenue: 0, severity });
      await emitIncidentOpened(newInc.number, rule.category, rc.system, severity, rows.length, rule.windowMinutes);
      created++;
    }

    // Attach only new notifications.
    const { data: existingKeys } = await db().from("incident_notifications").select("alert_key").eq("incident_id", incidentId);
    const have = new Set((existingKeys ?? []).map((k: any) => k.alert_key));
    const fresh = notifs.filter((n) => !have.has(n.alertKey));
    if (fresh.length) {
      await db().from("incident_notifications").upsert(fresh.map((n) => ({ incident_id: incidentId, alert_key: n.alertKey, order_number: n.orderNumber, severity: rule.notificationSeverity })), { onConflict: "incident_id,alert_key" });
      for (const n of fresh) await addHistory(incidentId, "notification_added", n.orderNumber ?? n.alertKey);
      attached += fresh.length;
    }
    await recompute(incidentId);
  }

  await groupCrossSystem();          // Phase 3: cascade across systems → ONE primary
  const { resolved } = await autoResolveIncidents();
  return { created, merged, attached, resolved, suppressed };
}

/**
 * ADVANCED CORRELATION (Phase 3) — group active incidents that share a root-cause system and
 * started within the correlation window under a single PRIMARY (a cascade like gateway-timeout →
 * refund-failed → payment-failed → email-failed becomes one Payment Gateway incident). The
 * earliest-started incident is the primary; later ones get `parent_incident_id`. Deterministic
 * and reversible — grouping only sets a pointer, never deletes; each link is logged.
 */
export async function groupCrossSystem(): Promise<{ grouped: number }> {
  let grouped = 0;
  try {
    const { data } = await db().from("incidents")
      .select("id,number,root_cause_system,started_at,parent_incident_id,severity")
      .in("status", ["open", "investigating", "mitigated"])
      .eq("is_simulation", false)
      .not("root_cause_system", "is", null)
      .neq("root_cause_system", "unknown")
      .order("started_at", { ascending: true });
    const rows = (data ?? []) as any[];
    const bySystem = new Map<string, any[]>();
    for (const r of rows) { const k = r.root_cause_system; if (!bySystem.has(k)) bySystem.set(k, []); bySystem.get(k)!.push(r); }

    for (const [, group] of bySystem) {
      if (group.length < 2) continue;                 // nothing to correlate
      const primary = group[0];                        // earliest = primary
      const primaryMs = new Date(primary.started_at).getTime();
      for (const child of group.slice(1)) {
        if (child.parent_incident_id === primary.id) continue;   // already linked
        if (child.id === primary.id) continue;
        if (!withinCorrelationWindow(primaryMs, new Date(child.started_at).getTime(), CROSS_SYSTEM_WINDOW_MIN)) continue;
        await db().from("incidents").update({ parent_incident_id: primary.id, last_activity_at: touch() }).eq("id", child.id);
        await addHistory(child.id, "correlated", `Grouped under ${primary.number} — same root cause (${ROOT_CAUSE_LABEL[primary.root_cause_system as RootCauseSystem]}) within ${CROSS_SYSTEM_WINDOW_MIN}m`);
        await addHistory(primary.id, "correlated", `${child.number} correlated into this incident`);
        grouped++;
      }
    }
  } catch { /* best-effort */ }
  return { grouped };
}

/** Current failing alert keys across all enabled rules (current state, not windowed). */
async function currentFailingKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const rule of INCIDENT_RULES) {
    if (!rule.enabled) continue;
    for (const r of await fetchRows(rule)) keys.add(r.alertKey);
  }
  return keys;
}

/** Mark resolved notifications; when every notification in an incident is resolved, auto-close it.
 *  Phase 4: RECOVERY DETECTION — record that the upstream system recovered (a positive signal, not
 *  a silent close), then generate a postmortem. Simulations are never auto-resolved by real signals. */
export async function autoResolveIncidents(): Promise<{ resolved: number }> {
  const failing = await currentFailingKeys();
  const { data: active } = await db().from("incidents").select("id,number,root_cause_system").eq("is_simulation", false).in("status", ["open", "investigating", "mitigated"]);
  let resolved = 0;
  for (const inc of (active ?? []) as any[]) {
    const { data: notifs } = await db().from("incident_notifications").select("id,alert_key,order_number,resolved_at").eq("incident_id", inc.id);
    for (const n of (notifs ?? []) as any[]) {
      if (!n.resolved_at && !failing.has(n.alert_key)) {
        await db().from("incident_notifications").update({ resolved_at: new Date().toISOString() }).eq("id", n.id);
        await addHistory(inc.id, "notification_resolved", n.order_number ?? n.alert_key);
      }
    }
    const { data: after } = await db().from("incident_notifications").select("resolved_at").eq("incident_id", inc.id);
    if (allNotificationsResolved(((after ?? []) as any[]).map((n) => ({ resolvedAt: n.resolved_at })))) {
      const sysLabel = inc.root_cause_system ? ROOT_CAUSE_LABEL[inc.root_cause_system as RootCauseSystem] : "The affected system";
      await db().from("incidents").update({ status: "resolved", resolved_at: new Date().toISOString(), recovery_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", inc.id);
      await addHistory(inc.id, "recovery_detected", `${sysLabel} responding normally — all failures cleared`);
      await addHistory(inc.id, "resolved", "All notifications resolved — auto-closed");
      await generatePostmortem(inc.number, { id: null, name: "Auto-resolver" });   // searchable postmortem
      resolved++;
    }
  }
  return { resolved };
}

// ── Queries ──────────────────────────────────────────────────────────────────
export interface IncidentRow {
  id: string; number: string; title: string; category: string; categoryLabel: string; severity: IncidentSeverity;
  status: string; rootCause: string | null; sourceSystem: string | null; team: string | null; ownerName: string | null; assigneeName: string | null;
  snoozedUntil: string | null; affectedOrders: number; affectedNotifications: number; startedAt: string; lastActivityAt: string; resolvedAt: string | null;
  rootCauseSystem: string | null; subsystem: string | null; parentIncidentId: string | null; escalationLevel: number; detectedAt: string | null;
  confidence: number | null; priority: string | null; priorityLabel: string | null; impactLevel: string | null;
  slaTargetMin: number | null; slaDueAt: string | null; slaBreached: boolean; impactCost: number | null; isSimulation: boolean;
}
const mapIncident = (r: any): IncidentRow => ({
  id: r.id, number: r.number, title: r.title, category: r.category, categoryLabel: INCIDENT_CATEGORY_LABEL[r.category as keyof typeof INCIDENT_CATEGORY_LABEL] ?? r.category,
  severity: r.severity, status: r.status, rootCause: r.root_cause ?? null, sourceSystem: r.source_system ?? null, team: r.team ?? null, ownerName: r.owner_name ?? null, assigneeName: r.assignee_name ?? null,
  snoozedUntil: r.snoozed_until ?? null, affectedOrders: r.affected_orders ?? 0, affectedNotifications: r.affected_notifications ?? 0, startedAt: r.started_at, lastActivityAt: r.last_activity_at, resolvedAt: r.resolved_at ?? null,
  rootCauseSystem: r.root_cause_system ?? null, subsystem: r.subsystem ?? null, parentIncidentId: r.parent_incident_id ?? null, escalationLevel: r.escalation_level ?? 0, detectedAt: r.detected_at ?? null,
  confidence: r.confidence ?? null, priority: r.priority ?? null, priorityLabel: r.priority ? PRIORITY_LABEL[r.priority as IncidentPriority] ?? r.priority : null, impactLevel: r.impact_level ?? null,
  slaTargetMin: r.sla_target_min ?? null, slaDueAt: r.sla_due_at ?? null, slaBreached: !!r.sla_breached, impactCost: r.impact_cost != null ? Number(r.impact_cost) : null, isSimulation: !!r.is_simulation,
});

export async function getIncidents(opts: { status?: "active" | "all"; limit?: number } = {}): Promise<IncidentRow[]> {
  try {
    let q = db().from("incidents").select("*").order("last_activity_at", { ascending: false }).limit(opts.limit ?? 100);
    if (opts.status === "active" || !opts.status) q = q.in("status", ["open", "investigating", "mitigated"]);
    const { data } = await q;
    return (data ?? []).map(mapIncident);
  } catch { return []; }
}

// ── Filters + search + pagination (Phase 2) ───────────────────────────────────
export interface IncidentFilters {
  status?: string;        // "active" | "all" | one of the statuses
  severity?: string; category?: string; team?: string;
  assigned?: string;      // "unassigned" | a staff name (e.g. current user for "mine")
  createdDays?: number;   // Created today (1) / this week (7)
  resolvedToday?: boolean;
  q?: string;             // ID / order / customer / gateway / reason / assignee
  priority?: string;      // p1..p4 (Phase 4)
  reviewQueue?: boolean;  // low-confidence incidents needing human review (Phase 4)
  slaBreached?: boolean;  // SLA-breached only (Phase 4)
  includeSimulations?: boolean; // show fire-drill incidents (default: hidden)
  page?: number; pageSize?: number;
}
export interface IncidentPage { rows: IncidentRow[]; total: number; page: number; pageSize: number }

export async function getIncidentsFiltered(f: IncidentFilters): Promise<IncidentPage> {
  const client = db();
  try {
    let q = client.from("incidents").select("*").order("last_activity_at", { ascending: false }).limit(1000);
    if (!f.status || f.status === "active") {
      q = q.in("status", ["open", "investigating", "mitigated"]).or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`); // hide snoozed
    } else if (f.status !== "all") q = q.eq("status", f.status);
    if (!f.includeSimulations) q = q.eq("is_simulation", false);   // fire-drills hidden by default
    if (f.severity) q = q.eq("severity", f.severity);
    if (f.category) q = q.eq("category", f.category);
    if (f.team) q = q.eq("team", f.team);
    if (f.priority) q = q.eq("priority", f.priority);
    if (f.slaBreached) q = q.eq("sla_breached", true);
    if (f.reviewQueue) q = q.lt("confidence", 70).in("status", ["open", "investigating", "mitigated"]);  // needs human review
    if (f.assigned === "unassigned") q = q.is("assignee_id", null);
    else if (f.assigned) q = q.eq("assignee_name", f.assigned);
    if (f.createdDays) q = q.gte("started_at", new Date(Date.now() - f.createdDays * 86400000).toISOString());
    if (f.resolvedToday) { const s = new Date(); s.setHours(0, 0, 0, 0); q = q.eq("status", "resolved").gte("resolved_at", s.toISOString()); }
    const { data } = await q;
    let rows: IncidentRow[] = (data ?? []).map(mapIncident);

    const term = (f.q ?? "").trim().toLowerCase();
    if (term) {
      const ids = new Set<string>();
      const { data: byOrder } = await client.from("incident_notifications").select("incident_id").ilike("order_number", `%${term}%`);
      for (const r of (byOrder ?? []) as any[]) ids.add(r.incident_id);
      const { data: custOrders } = await client.from("orders").select("order_number").ilike("ship_full_name", `%${term}%`).limit(300);
      const nums = (custOrders ?? []).map((o: any) => o.order_number);
      if (nums.length) { const { data: byCust } = await client.from("incident_notifications").select("incident_id").in("order_number", nums); for (const r of (byCust ?? []) as any[]) ids.add(r.incident_id); }
      rows = rows.filter((r) => ids.has(r.id) || matchesIncidentSearch([r.number, r.title, r.rootCause, r.sourceSystem, r.assigneeName, r.ownerName, r.team], term));
    }

    const total = rows.length;
    const page = Math.max(1, f.page ?? 1);
    const pageSize = f.pageSize ?? 20;
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
  } catch { return { rows: [], total: 0, page: 1, pageSize: f.pageSize ?? 20 }; }
}

/** All rows matching the filters (no pagination) — for CSV / Excel export. */
export async function getIncidentsForExport(f: IncidentFilters): Promise<IncidentRow[]> {
  const { rows } = await getIncidentsFiltered({ ...f, page: 1, pageSize: 100000 });
  return rows;
}

export interface IncidentImpact { orders: number; revenue: number; customers: number; refundValue: number; shipmentsDelayed: number; cost: number; costParts?: Record<string, number>; computedAt: string | null }
export interface SimilarIncident { number: string; title: string; status: string; score: number; reasons: string[]; kbResolution: string | null; prevention: string | null; resolvedAt: string | null }
export interface IncidentDetail extends IncidentRow {
  description: string | null; resolutionNotes: string | null; prevention: string | null; kbResolution: string | null;
  rootCauseWhy: string | null;
  notifications: { alertKey: string; orderNumber: string | null; severity: string | null; addedAt: string; resolvedAt: string | null }[];
  orders: string[];
  history: { event: string; detail: string | null; actorName: string | null; createdAt: string }[];
  related: { number: string; title: string; status: string }[];
  similar: SimilarIncident[];
  participants: { userId: string | null; userName: string; role: string }[];
  notes: { note: string; authorName: string | null; createdAt: string }[];
  checklist: { id: string; label: string; done: boolean; doneBy: string | null; doneAt: string | null }[];
  escalations: { level: number; targetRole: string; channels: string; reason: string; ageMinutes: number; createdAt: string }[];
  impact: IncidentImpact;
  parentNumber: string | null;
  children: { number: string; title: string; status: string; category: string }[];
  mttrMin: number | null; mttdMin: number | null;
  // Phase 4
  confidenceReasons: { factor: string; detail: string; points: number }[];
  impactLevelLabel: string | null;
  slaStatus: string; slaRemainingMin: number | null;
  nextEscalation: { level: number; notify: string; atMs: number } | null;
  runbook: { id: string; stepNo: number; title: string; instruction: string | null; action: string | null; done: boolean; doneBy: string | null; doneAt: string | null }[];
  postmortem: { summary: string | null; rootCause: string | null; impact: string | null; resolution: string | null; lessons: string | null; timeline: { at: string; event: string; detail: string | null }[]; generatedAt: string | null } | null;
  dependencyDownstream: { id: string; label: string }[];
  suggestedResolution: { number: string; resolution: string } | null;
  assignmentReason: string | null; dismissReason: string | null; falsePositive: boolean; reclassifiedFrom: string | null;
  mergedIntoNumber: string | null; splitFromNumber: string | null; recoveryAt: string | null;
}
export async function getIncidentByNumber(number: string): Promise<IncidentDetail | null> {
  try {
    const { data: inc } = await db().from("incidents").select("*").eq("number", number).maybeSingle();
    if (!inc) return null;
    const [{ data: notifs }, { data: hist }, { data: related }, { data: parts }, { data: notes }, { data: checklist }, { data: esc }, { data: kids }, parent, { data: runbook }, { data: pm }, merged, split] = await Promise.all([
      db().from("incident_notifications").select("alert_key,order_number,severity,added_at,resolved_at").eq("incident_id", inc.id).order("added_at", { ascending: true }),
      db().from("incident_history").select("event,detail,actor_name,created_at").eq("incident_id", inc.id).order("created_at", { ascending: true }),
      db().from("incidents").select("number,title,status").eq("category", inc.category).neq("id", inc.id).is("parent_incident_id", null).order("last_activity_at", { ascending: false }).limit(5),
      db().from("incident_participants").select("user_id,user_name,role").eq("incident_id", inc.id),
      db().from("incident_notes").select("note,author_name,created_at").eq("incident_id", inc.id).order("created_at", { ascending: false }),
      db().from("incident_checklist_items").select("id,label,done,done_by,done_at").eq("incident_id", inc.id).order("sort_order", { ascending: true }),
      db().from("incident_escalations").select("level,target_role,channels,reason,age_minutes,created_at").eq("incident_id", inc.id).order("level", { ascending: true }),
      db().from("incidents").select("number,title,status,category").eq("parent_incident_id", inc.id).order("started_at", { ascending: true }),
      inc.parent_incident_id ? db().from("incidents").select("number").eq("id", inc.parent_incident_id).maybeSingle() : Promise.resolve({ data: null }),
      db().from("incident_runbook_steps").select("id,step_no,title,instruction,action,done,done_by,done_at").eq("incident_id", inc.id).order("step_no", { ascending: true }),
      db().from("incident_postmortems").select("summary,root_cause,impact,resolution,lessons,timeline,generated_at").eq("incident_id", inc.id).maybeSingle(),
      inc.merged_into_id ? db().from("incidents").select("number").eq("id", inc.merged_into_id).maybeSingle() : Promise.resolve({ data: null }),
      inc.split_from_id ? db().from("incidents").select("number").eq("id", inc.split_from_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const orders = [...new Set((notifs ?? []).map((n: any) => n.order_number).filter(Boolean))] as string[];
    const rcWhy = (hist ?? []).find((h: any) => h.event === "root_cause_detected")?.detail ?? null;
    const similar = await getSimilarIncidents(inc);
    const sla = slaStatus(inc.sla_due_at ?? null, inc.resolved_at ?? null, Date.now());
    const suggested = similar.find((s) => s.kbResolution);
    return {
      ...mapIncident(inc), description: inc.description ?? null, resolutionNotes: inc.resolution_notes ?? null,
      prevention: inc.prevention ?? null, kbResolution: inc.kb_resolution ?? null, rootCauseWhy: rcWhy,
      notifications: (notifs ?? []).map((n: any) => ({ alertKey: n.alert_key, orderNumber: n.order_number ?? null, severity: n.severity ?? null, addedAt: n.added_at, resolvedAt: n.resolved_at ?? null })),
      orders,
      history: (hist ?? []).map((h: any) => ({ event: h.event, detail: h.detail ?? null, actorName: h.actor_name ?? null, createdAt: h.created_at })),
      related: (related ?? []).map((r: any) => ({ number: r.number, title: r.title, status: r.status })),
      similar,
      participants: (parts ?? []).map((p: any) => ({ userId: p.user_id ?? null, userName: p.user_name, role: p.role })),
      notes: (notes ?? []).map((n: any) => ({ note: n.note, authorName: n.author_name ?? null, createdAt: n.created_at })),
      checklist: (checklist ?? []).map((c: any) => ({ id: c.id, label: c.label, done: c.done, doneBy: c.done_by ?? null, doneAt: c.done_at ?? null })),
      escalations: (esc ?? []).map((e: any) => ({ level: e.level, targetRole: e.target_role, channels: e.channels, reason: e.reason, ageMinutes: e.age_minutes, createdAt: e.created_at })),
      impact: { orders: inc.impact_orders ?? 0, revenue: Number(inc.impact_revenue ?? 0), customers: inc.impact_customers ?? 0, refundValue: Number(inc.impact_refund_value ?? 0), shipmentsDelayed: inc.impact_shipments_delayed ?? 0, cost: Number(inc.impact_cost ?? 0), computedAt: inc.impact_computed_at ?? null },
      parentNumber: (parent as any)?.data?.number ?? null,
      children: (kids ?? []).map((k: any) => ({ number: k.number, title: k.title, status: k.status, category: k.category })),
      mttrMin: inc.resolved_at ? Math.round(minutesBetween(inc.started_at, inc.resolved_at)) : null,
      mttdMin: inc.detected_at ? Math.max(0, Math.round(minutesBetween(inc.detected_at, inc.started_at))) : null,
      confidenceReasons: Array.isArray(inc.confidence_reasons) ? inc.confidence_reasons : [],
      impactLevelLabel: inc.impact_level ? IMPACT_LABEL[inc.impact_level as ImpactLevel] ?? inc.impact_level : null,
      slaStatus: sla.status, slaRemainingMin: sla.remainingMin,
      nextEscalation: ["open", "investigating", "mitigated"].includes(inc.status) ? nextEscalationInfo(new Date(inc.started_at).getTime(), inc.escalation_level ?? 0, ESCALATION_POLICY) : null,
      runbook: (runbook ?? []).map((s: any) => ({ id: s.id, stepNo: s.step_no, title: s.title, instruction: s.instruction ?? null, action: s.action ?? null, done: s.done, doneBy: s.done_by ?? null, doneAt: s.done_at ?? null })),
      postmortem: pm ? { summary: pm.summary ?? null, rootCause: pm.root_cause ?? null, impact: pm.impact ?? null, resolution: pm.resolution ?? null, lessons: pm.lessons ?? null, timeline: Array.isArray(pm.timeline) ? pm.timeline : [], generatedAt: pm.generated_at ?? null } : null,
      dependencyDownstream: (inc.root_cause_system ? dependencyDownstream(inc.root_cause_system as DepNode) : []).map((id) => ({ id, label: DEPENDENCY_NODES.find((n) => n.id === id)?.label ?? id })),
      suggestedResolution: suggested ? { number: suggested.number, resolution: suggested.kbResolution as string } : null,
      assignmentReason: inc.assignment_reason ?? null, dismissReason: inc.dismiss_reason ?? null, falsePositive: !!inc.false_positive, reclassifiedFrom: inc.reclassified_from ?? null,
      mergedIntoNumber: (merged as any)?.data?.number ?? null, splitFromNumber: (split as any)?.data?.number ?? null, recoveryAt: inc.recovery_at ?? null,
    };
  } catch { return null; }
}

/** alert_key → incident number, for the "Part of INC-xxxx" badge on notifications. */
export async function getIncidentsForAlertKeys(alertKeys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!alertKeys.length) return out;
  try {
    const { data } = await db().from("incident_notifications").select("alert_key,incidents!inner(number,status)").in("alert_key", alertKeys).in("incidents.status", ["open", "investigating", "mitigated"]);
    for (const r of (data ?? []) as any[]) out.set(r.alert_key, r.incidents.number);
  } catch { /* best-effort */ }
  return out;
}

/** Incident number affecting a given order (for the order page banner). */
export async function getIncidentForOrder(orderNumber: string): Promise<{ number: string; title: string } | null> {
  try {
    const { data } = await db().from("incident_notifications").select("incidents!inner(number,title,status)").eq("order_number", orderNumber).in("incidents.status", ["open", "investigating", "mitigated"]).limit(1);
    const r = (data ?? [])[0];
    return r ? { number: r.incidents.number, title: r.incidents.title } : null;
  } catch { return null; }
}

// ── Metrics ──────────────────────────────────────────────────────────────────
export interface IncidentMetrics { critical: number; high: number; open: number; resolvedToday: number; avgResolutionMin: number | null; oldestOpenMin: number | null }
export async function getIncidentMetrics(): Promise<IncidentMetrics> {
  try {
    const client = db();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [{ data: active }, { data: resolvedToday }] = await Promise.all([
      client.from("incidents").select("severity,started_at").in("status", ["open", "investigating", "mitigated"]),
      client.from("incidents").select("started_at,resolved_at").eq("status", "resolved").gte("resolved_at", start.toISOString()),
    ]);
    const act = (active ?? []) as any[];
    const oldest = act.reduce((o: number | null, i: any) => { const age = (Date.now() - new Date(i.started_at).getTime()) / 60000; return o == null || age > o ? age : o; }, null as number | null);
    const spans = ((resolvedToday ?? []) as any[]).map((i: any) => (new Date(i.resolved_at).getTime() - new Date(i.started_at).getTime()) / 60000);
    return {
      critical: act.filter((i) => i.severity === "critical").length,
      high: act.filter((i) => i.severity === "high").length,
      open: act.length,
      resolvedToday: (resolvedToday ?? []).length,
      avgResolutionMin: spans.length ? Math.round(spans.reduce((a: number, b: number) => a + b, 0) / spans.length) : null,
      oldestOpenMin: oldest == null ? null : Math.round(oldest),
    };
  } catch { return { critical: 0, high: 0, open: 0, resolvedToday: 0, avgResolutionMin: null, oldestOpenMin: null }; }
}

// ── Mutations (Phase 2 collaboration) ─────────────────────────────────────────
type Actor = { id: string | null; name: string };
const touch = () => new Date().toISOString();
async function incId(number: string): Promise<string | null> {
  const { data } = await db().from("incidents").select("id").eq("number", number).maybeSingle();
  return data?.id ?? null;
}

/** Assign to a target (or self). The FIRST assignee also becomes the owner. */
export async function assignIncident(number: string, target: Actor, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const { data: inc } = await db().from("incidents").select("id,owner_id,assignee_name").eq("number", number).maybeSingle();
    if (!inc) return { ok: false };
    const patch: any = { assignee_id: target.id, assignee_name: target.name, last_activity_at: touch() };
    if (!inc.owner_id) { patch.owner_id = target.id; patch.owner_name = target.name; }
    await db().from("incidents").update(patch).eq("id", inc.id);
    await addHistory(inc.id, inc.assignee_name ? "transferred" : "assigned", inc.assignee_name ? `${inc.assignee_name} → ${target.name}` : target.name, actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
export async function removeAssignment(number: string, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const id = await incId(number); if (!id) return { ok: false };
    await db().from("incidents").update({ assignee_id: null, assignee_name: null, last_activity_at: touch() }).eq("id", id);
    await addHistory(id, "unassigned", "Assignment removed", actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
export async function watchIncident(number: string, watcher: Actor, role: "watcher" | "follower", actor: Actor): Promise<{ ok: boolean }> {
  try {
    const id = await incId(number); if (!id) return { ok: false };
    await db().from("incident_participants").upsert({ incident_id: id, user_id: watcher.id, user_name: watcher.name, role }, { onConflict: "incident_id,user_id,role" });
    await addHistory(id, "watcher_added", `${watcher.name} (${role})`, actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
export async function unwatchIncident(number: string, userId: string | null, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const id = await incId(number); if (!id) return { ok: false };
    if (userId) await db().from("incident_participants").delete().eq("incident_id", id).eq("user_id", userId);
    await addHistory(id, "watcher_removed", actor.name, actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
export async function setIncidentTeam(number: string, team: string, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const { data: inc } = await db().from("incidents").select("id,team").eq("number", number).maybeSingle();
    if (!inc) return { ok: false };
    await db().from("incidents").update({ team, last_activity_at: touch() }).eq("id", inc.id);
    await addHistory(inc.id, "team_changed", `${inc.team ?? "none"} → ${team}`, actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
export async function setIncidentStatus(number: string, status: string, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const { data: inc } = await db().from("incidents").select("id,status").eq("number", number).maybeSingle();
    if (!inc) return { ok: false };
    const patch: any = { status, last_activity_at: touch(), updated_at: touch() };
    if (status === "resolved" || status === "closed") patch.resolved_at = touch();
    await db().from("incidents").update(patch).eq("id", inc.id);
    await addHistory(inc.id, "status_changed", `${inc.status} → ${status}`, actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
/** Manual severity override — locks auto-inheritance (logged as severity_changed). */
export async function setIncidentSeverity(number: string, severity: string, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const { data: inc } = await db().from("incidents").select("id,severity").eq("number", number).maybeSingle();
    if (!inc) return { ok: false };
    await db().from("incidents").update({ severity, severity_locked: true, last_activity_at: touch() }).eq("id", inc.id);
    await addHistory(inc.id, "severity_changed", `${inc.severity} → ${severity}`, actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
/** Add a timestamped operational note (append-only; never deleted). */
export async function addIncidentNote(number: string, note: string, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const id = await incId(number); if (!id) return { ok: false };
    await db().from("incident_notes").insert({ incident_id: id, note, author_id: actor.id, author_name: actor.name });
    await db().from("incidents").update({ last_activity_at: touch() }).eq("id", id);
    await addHistory(id, "comment_added", note.slice(0, 120), actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
export async function toggleChecklistItem(itemId: string, done: boolean, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const { data: item } = await db().from("incident_checklist_items").select("id,incident_id,label").eq("id", itemId).maybeSingle();
    if (!item) return { ok: false };
    await db().from("incident_checklist_items").update({ done, done_by: done ? actor.name : null, done_at: done ? touch() : null }).eq("id", itemId);
    await db().from("incidents").update({ last_activity_at: touch() }).eq("id", item.incident_id);
    await addHistory(item.incident_id, "checklist_toggled", `${done ? "✓" : "☐"} ${item.label}`, actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
export async function snoozeIncident(number: string, minutes: number, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const id = await incId(number); if (!id) return { ok: false };
    const until = minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null;
    await db().from("incidents").update({ snoozed_until: until, last_activity_at: touch() }).eq("id", id);
    await addHistory(id, "snoozed", until ? `until ${new Date(until).toLocaleString("en-IN")}` : "unsnoozed", actor);
    return { ok: true };
  } catch { return { ok: false }; }
}

/** Staff list for the assign/transfer picker. */
export async function getStaffUsers(): Promise<{ id: string; name: string }[]> {
  try {
    const { data } = await db().from("users").select("id,full_name,role").in("role", ["editor", "manager", "admin", "super_admin"]).order("full_name");
    return (data ?? []).map((u: any) => ({ id: u.id, name: u.full_name ?? "Staff" }));
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 — Operations Intelligence services
// ═══════════════════════════════════════════════════════════════════════════════

/** RELATED INCIDENTS — resolved/closed incidents that resemble this one (deterministic score),
 *  surfacing their knowledge base so ops can reuse a prior fix. "Resembles INC-00008." */
export async function getSimilarIncidents(inc: any): Promise<SimilarIncident[]> {
  try {
    const { data } = await db().from("incidents")
      .select("number,title,status,category,root_cause_system,source_system,kb_resolution,prevention,resolved_at")
      .in("status", ["resolved", "closed"]).neq("id", inc.id)
      .or(`category.eq.${inc.category},root_cause_system.eq.${inc.root_cause_system ?? "unknown"}`)
      .order("resolved_at", { ascending: false }).limit(50);
    const self = { category: inc.category, rootCauseSystem: inc.root_cause_system, sourceSystem: inc.source_system };
    return ((data ?? []) as any[])
      .map((r) => {
        const { score, reasons } = resemblance(self, { category: r.category, rootCauseSystem: r.root_cause_system, sourceSystem: r.source_system });
        return { number: r.number, title: r.title, status: r.status, score, reasons, kbResolution: r.kb_resolution ?? null, prevention: r.prevention ?? null, resolvedAt: r.resolved_at ?? null };
      })
      .filter((s) => s.score >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  } catch { return []; }
}

/** BUSINESS IMPACT — estimate the blast radius from the incident's affected orders, and snapshot
 *  it onto the incident. Deterministic: every number traces to concrete order/refund/shipment rows. */
export async function computeBusinessImpact(number: string): Promise<IncidentImpact | null> {
  try {
    const { data: inc } = await db().from("incidents").select("id,started_at,resolved_at,sla_breached").eq("number", number).maybeSingle();
    if (!inc) return null;
    const id = inc.id;
    const { data: notifs } = await db().from("incident_notifications").select("order_number").eq("incident_id", id);
    const orderNumbers = [...new Set(((notifs ?? []) as any[]).map((n) => n.order_number).filter(Boolean))] as string[];
    let revenue = 0, refundValue = 0, customers = 0, shipmentsDelayed = 0;
    if (orderNumbers.length) {
      const { data: orders } = await db().from("orders").select("id,order_number,total_amount,refund_amount,email,user_id").in("order_number", orderNumbers);
      const rows = (orders ?? []) as any[];
      revenue = rows.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
      refundValue = rows.reduce((s, o) => s + Number(o.refund_amount ?? 0), 0);
      customers = new Set(rows.map((o) => o.user_id ?? o.email).filter(Boolean)).size;
      const { data: exc } = await db().from("shipment_exceptions").select("order_number").in("order_number", orderNumbers).eq("type", "delayed");
      shipmentsDelayed = new Set(((exc ?? []) as any[]).map((e) => e.order_number)).size;
    }
    // Estimated financial cost of the incident (deterministic COST_MODEL).
    const ageHours = ((inc.resolved_at ? new Date(inc.resolved_at).getTime() : Date.now()) - new Date(inc.started_at).getTime()) / 3_600_000;
    const cost = estimateCost({ revenue, refundValue, shipmentsDelayed, slaBreached: !!inc.sla_breached, ageHours });
    const impact: IncidentImpact = { orders: orderNumbers.length, revenue: Math.round(revenue * 100) / 100, customers, refundValue: Math.round(refundValue * 100) / 100, shipmentsDelayed, cost: cost.total, costParts: cost.parts, computedAt: touch() };
    await db().from("incidents").update({ impact_orders: impact.orders, impact_revenue: impact.revenue, impact_customers: impact.customers, impact_refund_value: impact.refundValue, impact_shipments_delayed: impact.shipmentsDelayed, impact_cost: impact.cost, impact_computed_at: impact.computedAt }).eq("id", id);
    return impact;
  } catch { return null; }
}

/** SLA BREACH TRACKING — mark active incidents whose resolution SLA has elapsed (once), log it, and
 *  bump escalation so a breach pages someone. Runs in the cron. */
export async function runSlaChecks(): Promise<{ breached: number }> {
  let breached = 0;
  try {
    const nowIso = new Date().toISOString();
    const { data } = await db().from("incidents").select("id,number,sla_target_min").eq("is_simulation", false).eq("sla_breached", false).in("status", ["open", "investigating", "mitigated"]).not("sla_due_at", "is", null).lt("sla_due_at", nowIso);
    for (const inc of (data ?? []) as any[]) {
      await db().from("incidents").update({ sla_breached: true, sla_breached_at: nowIso, last_activity_at: nowIso }).eq("id", inc.id);
      await addHistory(inc.id, "sla_breached", `Resolution SLA of ${inc.sla_target_min}m exceeded`);
      breached++;
    }
  } catch { /* best-effort */ }
  return { breached };
}

/** Refresh business-impact snapshots for active incidents (bounded per run for scale). */
export async function refreshActiveImpacts(limit = 50): Promise<{ impactsRefreshed: number }> {
  let impactsRefreshed = 0;
  try {
    const { data } = await db().from("incidents").select("number").in("status", ["open", "investigating", "mitigated"]).order("last_activity_at", { ascending: false }).limit(limit);
    for (const inc of (data ?? []) as any[]) { if (await computeBusinessImpact(inc.number)) impactsRefreshed++; }
  } catch { /* best-effort */ }
  return { impactsRefreshed };
}

// ── HEALTH DASHBOARD ───────────────────────────────────────────────────────────
export interface SubsystemHealth { subsystem: Subsystem; label: string; state: HealthState; why: string; active: number }
export interface SystemHealth { overall: HealthState; subsystems: SubsystemHealth[]; computedAt: string }
export async function getSystemHealth(): Promise<SystemHealth> {
  const now = Date.now();
  try {
    const { data } = await db().from("incidents").select("subsystem,category,severity,started_at").eq("is_simulation", false).in("status", ["open", "investigating", "mitigated"]);
    const active = (data ?? []) as any[];
    const subsystems: SubsystemHealth[] = SUBSYSTEMS.map((s) => {
      const mine = active.filter((i) => (i.subsystem ?? categorySubsystem(i.category)) === s).map((i) => ({ severity: i.severity as IncidentSeverity, startedAt: i.started_at }));
      const { state, why } = subsystemHealth(mine, now);
      return { subsystem: s, label: SUBSYSTEM_LABEL[s], state, why, active: mine.length };
    });
    return { overall: overallHealth(subsystems.map((s) => s.state)), subsystems, computedAt: new Date(now).toISOString() };
  } catch {
    return { overall: "healthy", subsystems: SUBSYSTEMS.map((s) => ({ subsystem: s, label: SUBSYSTEM_LABEL[s], state: "healthy" as HealthState, why: "unavailable", active: 0 })), computedAt: new Date(now).toISOString() };
  }
}

// ── ESCALATION ─────────────────────────────────────────────────────────────────
async function recipientsForRole(role: "manager" | "admin"): Promise<{ email: string; name: string }[]> {
  const roles = role === "manager" ? ["manager", "admin", "super_admin"] : ["admin", "super_admin"];
  try {
    const { data } = await db().from("users").select("email,full_name,role").in("role", roles);
    return ((data ?? []) as any[]).filter((u) => u.email).map((u) => ({ email: u.email, name: u.full_name ?? "Staff" }));
  } catch { return []; }
}

/** Run the time-based escalation policy over unresolved incidents. Each level fires once (DB
 *  uniqueness). Channels: email is sent (if configured); Slack/SMS are logged (not yet wired). */
export async function runEscalations(): Promise<{ escalated: number }> {
  let escalated = 0;
  try {
    const { data } = await db().from("incidents").select("id,number,title,severity,started_at,escalation_level,status,is_simulation").in("status", ["open", "investigating", "mitigated"]);
    const minRank = severityRank(ESCALATION_MIN_SEVERITY);
    for (const inc of (data ?? []) as any[]) {
      if (severityRank(inc.severity as IncidentSeverity) < minRank) continue;   // low/info never page
      const ageMin = Math.floor((Date.now() - new Date(inc.started_at).getTime()) / 60000);
      const due = dueEscalations(ageMin, inc.escalation_level ?? 0, ESCALATION_POLICY);
      for (const level of due) {
        const reason = `Unresolved ${ageMin} min (threshold ${level.afterMinutes} min)`;
        // Ledger row — unique per (incident, level); ignore duplicate if a concurrent run beat us.
        const { error } = await db().from("incident_escalations").insert({ incident_id: inc.id, level: level.level, target_role: level.notify, channels: level.channels.join(","), reason, age_minutes: ageMin });
        if (error) continue;
        await db().from("incidents").update({ escalation_level: level.level, last_activity_at: touch() }).eq("id", inc.id);
        await addHistory(inc.id, "escalated", `L${level.level} → ${level.notify} via ${level.channels.join(", ")} — ${reason}${inc.is_simulation ? " (simulation — no dispatch)" : ""}`);
        if (!inc.is_simulation) await dispatchEscalation(inc, level, reason);   // fire drills never send real pages
        escalated++;
      }
    }
  } catch { /* best-effort */ }
  return { escalated };
}

async function dispatchEscalation(inc: any, level: { notify: "manager" | "admin"; channels: string[] }, reason: string): Promise<void> {
  // Real multi-channel dispatch through the operational notification engine. The escalation
  // policy's channels (in_app/email/slack/sms) map 1:1 to ops channel keys. SMS only fires when the
  // incident severity is critical (the SMS channel enforces this), keeping SMS for true emergencies.
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const emails = level.channels.includes("email") ? (await recipientsForRole(level.notify)).map((r) => r.email) : undefined;
  const payload: OpsPayload = {
    title: `Incident ${inc.number} escalated (L${(inc.escalation_level ?? 0)})`,
    message: `${inc.title} — ${reason}. Paged: ${level.notify}.`,
    severity: inc.severity === "critical" ? "critical" : "warning",
    fields: [
      { label: "Incident", value: inc.number }, { label: "Severity", value: inc.severity },
      { label: "Escalated to", value: level.notify }, { label: "Reason", value: reason },
    ],
    url: base ? `${base}/admin/incidents/${inc.number}` : undefined,
    slackChannel: "tech", entityType: "incident", entityRef: inc.number, emailTo: emails,
  };
  try { await notifyOps("incident.escalated", payload, { channels: level.channels as OpsChannelKey[] }); } catch { /* non-fatal */ }
}

// ── ANALYTICS / ARCHIVE ────────────────────────────────────────────────────────
export interface IncidentAnalytics {
  windowDays: number; total: number; open: number; resolved: number;
  avgResolutionMin: number | null; mttdMin: number | null; mttrMin: number | null;
  topTypes: { key: string; label: string; count: number }[];
  topRootCauses: { key: string; label: string; count: number }[];
  monthly: { month: string; opened: number; resolved: number }[];
}
export async function getIncidentAnalytics(windowDays = 90): Promise<IncidentAnalytics> {
  try {
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();
    const { data } = await db().from("incidents").select("category,root_cause_system,status,started_at,detected_at,resolved_at").eq("is_simulation", false).gte("started_at", since).limit(20000);
    const rows = (data ?? []) as any[];
    const resolved = rows.filter((r) => r.resolved_at);
    const mttr = meanMinutes(resolved.map((r) => minutesBetween(r.started_at, r.resolved_at)));
    const mttd = meanMinutes(rows.filter((r) => r.detected_at).map((r) => minutesBetween(r.detected_at, r.started_at)));
    const monthlyMap = new Map<string, { opened: number; resolved: number }>();
    for (const r of rows) {
      const m = String(r.started_at).slice(0, 7);
      const cur = monthlyMap.get(m) ?? { opened: 0, resolved: 0 };
      cur.opened++; if (r.resolved_at) cur.resolved++;
      monthlyMap.set(m, cur);
    }
    return {
      windowDays, total: rows.length,
      open: rows.filter((r) => ["open", "investigating", "mitigated"].includes(r.status)).length,
      resolved: resolved.length,
      avgResolutionMin: mttr, mttrMin: mttr, mttdMin: mttd,
      topTypes: topBy(rows, (r) => r.category).map((t) => ({ ...t, label: INCIDENT_CATEGORY_LABEL[t.key as IncidentCategory] ?? t.key })),
      topRootCauses: topBy(rows, (r) => r.root_cause_system).map((t) => ({ ...t, label: ROOT_CAUSE_LABEL[t.key as RootCauseSystem] ?? t.key })),
      monthly: [...monthlyMap.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
    };
  } catch {
    return { windowDays, total: 0, open: 0, resolved: 0, avgResolutionMin: null, mttdMin: null, mttrMin: null, topTypes: [], topRootCauses: [], monthly: [] };
  }
}

// ── KNOWLEDGE BASE (resolve requires root cause + resolution + prevention) ───────
export async function resolveWithKnowledge(number: string, kb: { rootCause: string; resolution: string; prevention: string }, actor: Actor): Promise<{ ok: boolean; error?: string }> {
  if (!kb.rootCause?.trim() || !kb.resolution?.trim() || !kb.prevention?.trim()) return { ok: false, error: "Root cause, resolution and prevention are all required to resolve." };
  try {
    const id = await incId(number); if (!id) return { ok: false, error: "Incident not found." };
    await db().from("incidents").update({
      status: "resolved", resolved_at: touch(), last_activity_at: touch(), updated_at: touch(),
      root_cause: kb.rootCause.trim(), kb_resolution: kb.resolution.trim(), resolution_notes: kb.resolution.trim(), prevention: kb.prevention.trim(),
    }).eq("id", id);
    await addHistory(id, "resolved", `Resolved with KB — cause: ${kb.rootCause.slice(0, 80)}`, actor);
    await computeBusinessImpact(number);        // snapshot final blast radius
    await generatePostmortem(number, actor);    // searchable postmortem
    return { ok: true };
  } catch { return { ok: false, error: "Failed to resolve." }; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4 — Enterprise Readiness services
// ═══════════════════════════════════════════════════════════════════════════════

/** POSTMORTEM GENERATOR — deterministically assemble a searchable postmortem from the incident,
 *  its history and impact snapshot. Upserted (one per incident). No AI: pure aggregation. */
export async function generatePostmortem(number: string, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const { data: inc } = await db().from("incidents").select("*").eq("number", number).maybeSingle();
    if (!inc) return { ok: false };
    const { data: hist } = await db().from("incident_history").select("event,detail,created_at").eq("incident_id", inc.id).order("created_at", { ascending: true });
    const catLabel = INCIDENT_CATEGORY_LABEL[inc.category as IncidentCategory] ?? inc.category;
    const mttr = inc.resolved_at ? Math.round(minutesBetween(inc.started_at, inc.resolved_at)) : null;
    const summary = `${inc.number} — ${inc.title}. ${catLabel} incident on the ${inc.subsystem ?? "—"} subsystem (severity ${inc.severity}${inc.priority ? `, ${PRIORITY_LABEL[inc.priority as IncidentPriority]}` : ""}). Opened ${inc.started_at}${inc.resolved_at ? `, resolved ${inc.resolved_at}${mttr != null ? ` (MTTR ${mttr} min)` : ""}` : ""}.`;
    const rcWhy = (hist ?? []).find((h: any) => h.event === "root_cause_detected")?.detail ?? "";
    const rootCause = `${inc.root_cause ?? "Unknown"}${inc.root_cause_system ? ` — attributed to ${ROOT_CAUSE_LABEL[inc.root_cause_system as RootCauseSystem]}` : ""}${rcWhy ? ` (${rcWhy})` : ""}.`;
    const impact = `${inc.impact_orders ?? 0} orders, ₹${Number(inc.impact_revenue ?? 0).toLocaleString("en-IN")} revenue, ${inc.impact_customers ?? 0} customers, ₹${Number(inc.impact_refund_value ?? 0).toLocaleString("en-IN")} refunds, ${inc.impact_shipments_delayed ?? 0} shipments delayed. Estimated cost ₹${Number(inc.impact_cost ?? 0).toLocaleString("en-IN")}.`;
    const resolution = inc.kb_resolution || inc.resolution_notes || (inc.recovery_at ? "Auto-resolved when the upstream system recovered." : "Resolved.");
    const lessons = inc.prevention || (inc.sla_breached ? "SLA was breached — review escalation/thresholds and consider staffing for this window." : "Consider whether a suppression rule, dynamic threshold, or runbook update would reduce recurrence.");
    const timeline = (hist ?? []).map((h: any) => ({ at: h.created_at, event: h.event, detail: h.detail ?? null }));
    await db().from("incident_postmortems").upsert({ incident_id: inc.id, summary, root_cause: rootCause, timeline, impact, resolution, lessons, generated_at: touch(), generated_by: actor.name }, { onConflict: "incident_id" });
    await addHistory(inc.id, "postmortem_generated", "Postmortem assembled", actor);
    return { ok: true };
  } catch { return { ok: false }; }
}

/** MANUAL MERGE — fold source into target: move its notifications, mark it merged (never deleted). */
export async function mergeIncidents(sourceNumber: string, targetNumber: string, actor: Actor): Promise<{ ok: boolean; error?: string }> {
  if (sourceNumber === targetNumber) return { ok: false, error: "Cannot merge an incident into itself." };
  try {
    const { data: src } = await db().from("incidents").select("id,number,status").eq("number", sourceNumber).maybeSingle();
    const { data: tgt } = await db().from("incidents").select("id,number").eq("number", targetNumber).maybeSingle();
    if (!src || !tgt) return { ok: false, error: "Incident not found." };
    const [{ data: srcNotifs }, { data: tgtNotifs }] = await Promise.all([
      db().from("incident_notifications").select("id,alert_key").eq("incident_id", src.id),
      db().from("incident_notifications").select("alert_key").eq("incident_id", tgt.id),
    ]);
    const have = new Set(((tgtNotifs ?? []) as any[]).map((n) => n.alert_key));
    for (const n of (srcNotifs ?? []) as any[]) {
      if (have.has(n.alert_key)) await db().from("incident_notifications").delete().eq("id", n.id);   // dup → drop
      else await db().from("incident_notifications").update({ incident_id: tgt.id }).eq("id", n.id);   // move
    }
    await db().from("incidents").update({ status: "merged", merged_into_id: tgt.id, resolved_at: touch(), last_activity_at: touch() }).eq("id", src.id);
    await addHistory(src.id, "merged", `Merged into ${tgt.number}`, actor);
    await addHistory(tgt.id, "merged", `${src.number} merged into this incident`, actor);
    await recompute(tgt.id);
    return { ok: true };
  } catch { return { ok: false, error: "Merge failed." }; }
}

/** MANUAL SPLIT — move selected notifications out of an incident into a new one (created from it). */
export async function splitIncident(number: string, alertKeys: string[], actor: Actor): Promise<{ ok: boolean; number?: string; error?: string }> {
  if (!alertKeys?.length) return { ok: false, error: "Select at least one notification to split out." };
  try {
    const { data: src } = await db().from("incidents").select("*").eq("number", number).maybeSingle();
    if (!src) return { ok: false, error: "Incident not found." };
    const { data: newInc } = await db().from("incidents").insert({
      title: `${src.title} (split)`, category: src.category, severity: src.severity, status: "open",
      root_cause: src.root_cause, source_system: src.source_system, rule_id: src.rule_id, team: src.team,
      root_cause_system: src.root_cause_system, subsystem: src.subsystem, detected_at: src.detected_at,
      confidence: src.confidence, priority: src.priority, impact_level: src.impact_level,
      sla_target_min: src.sla_target_min, sla_due_at: src.sla_due_at, split_from_id: src.id,
      description: `Split from ${src.number}.`,
    }).select("id,number").single();
    await db().from("incident_notifications").update({ incident_id: newInc.id }).eq("incident_id", src.id).in("alert_key", alertKeys);
    await addHistory(src.id, "split", `${alertKeys.length} notification(s) split into ${newInc.number}`, actor);
    await addHistory(newInc.id, "split", `Split from ${src.number}`, actor);
    await Promise.all([recompute(src.id), recompute(newInc.id)]);
    return { ok: true, number: newInc.number };
  } catch { return { ok: false, error: "Split failed." }; }
}

/** DISMISS — mark a false positive (auditable; never deleted). */
export async function dismissIncident(number: string, reason: string, actor: Actor): Promise<{ ok: boolean; error?: string }> {
  if (!reason?.trim()) return { ok: false, error: "A dismissal reason is required." };
  try {
    const id = await incId(number); if (!id) return { ok: false, error: "Incident not found." };
    await db().from("incidents").update({ status: "dismissed", false_positive: true, dismissed_at: touch(), dismiss_reason: reason.trim(), resolved_at: touch(), last_activity_at: touch() }).eq("id", id);
    await addHistory(id, "dismissed", `False positive — ${reason.slice(0, 120)}`, actor);
    return { ok: true };
  } catch { return { ok: false, error: "Dismiss failed." }; }
}

/** RECLASSIFY — correct a mis-categorised incident (records the previous category). */
export async function reclassifyIncident(number: string, newCategory: string, actor: Actor): Promise<{ ok: boolean; error?: string }> {
  const cat = newCategory as IncidentCategory;
  if (!INCIDENT_CATEGORY_LABEL[cat]) return { ok: false, error: "Unknown category." };
  try {
    const { data: inc } = await db().from("incidents").select("id,category").eq("number", number).maybeSingle();
    if (!inc) return { ok: false, error: "Incident not found." };
    if (inc.category === cat) return { ok: false, error: "Already this category." };
    await db().from("incidents").update({ category: cat, reclassified_from: inc.category, subsystem: categorySubsystem(cat), team: CATEGORY_TEAM[cat], last_activity_at: touch() }).eq("id", inc.id);
    await addHistory(inc.id, "reclassified", `${INCIDENT_CATEGORY_LABEL[inc.category as IncidentCategory] ?? inc.category} → ${INCIDENT_CATEGORY_LABEL[cat]}`, actor);
    return { ok: true };
  } catch { return { ok: false, error: "Reclassify failed." }; }
}

/** Tick a runbook step (guided workflow). */
export async function toggleRunbookStep(stepId: string, done: boolean, actor: Actor): Promise<{ ok: boolean }> {
  try {
    const { data: step } = await db().from("incident_runbook_steps").select("id,incident_id,title").eq("id", stepId).maybeSingle();
    if (!step) return { ok: false };
    await db().from("incident_runbook_steps").update({ done, done_by: done ? actor.name : null, done_at: done ? touch() : null }).eq("id", stepId);
    await db().from("incidents").update({ last_activity_at: touch() }).eq("id", step.incident_id);
    await addHistory(step.incident_id, "runbook_step", `${done ? "✓" : "☐"} ${step.title}`, actor);
    return { ok: true };
  } catch { return { ok: false }; }
}

/** SIMULATION / FIRE DRILL — create a flagged incident to exercise routing/escalation/notification
 *  without touching production metrics. Routing (auto-assignment) is real; escalation + notification
 *  are previewed deterministically in the history (no real emails sent). */
export async function createSimulationIncident(opts: { category?: string; severity?: string }, actor: Actor): Promise<{ ok: boolean; number?: string }> {
  try {
    const category = (opts.category as IncidentCategory) && INCIDENT_CATEGORY_LABEL[opts.category as IncidentCategory] ? (opts.category as IncidentCategory) : "refund";
    const severity = (["critical", "high", "medium", "low", "info"].includes(opts.severity ?? "") ? opts.severity : "high") as IncidentSeverity;
    const rc = classifyRootCause({ sourceSystem: CATEGORY_TEAM[category] === "finance" ? "Razorpay" : null, category, reason: category });
    const impactLevel = impactLevelFromOrders(0);
    const priority = priorityFrom(severity, impactLevel);
    const slaMin = slaTargetFor(priority);
    const now = Date.now();
    const { data: inc } = await db().from("incidents").insert({
      title: `[SIMULATION] ${INCIDENT_CATEGORY_LABEL[category]} fire drill`, category, severity, status: "open",
      root_cause: "Simulated incident (fire drill)", source_system: "Simulation", team: CATEGORY_TEAM[category],
      root_cause_system: rc.system, subsystem: categorySubsystem(category), detected_at: new Date(now).toISOString(),
      confidence: 100, confidence_reasons: [{ factor: "simulation", detail: "Operator-created fire drill", points: 100 }],
      priority, impact_level: impactLevel, sla_target_min: slaMin, sla_due_at: new Date(now + slaMin * 60000).toISOString(),
      is_simulation: true, description: "Fire-drill incident — excluded from health, analytics and metrics.",
    }).select("id,number").single();
    await seedChecklist(inc.id, category);
    await seedRunbook(inc.id, category);
    await addHistory(inc.id, "simulation_created", `Fire drill created by ${actor.name}`, actor);
    await applyAutoAssignment(inc.id, { category, rootCauseSystem: rc.system, revenue: 0, severity });   // real routing
    // Deterministic escalation + notification preview (no real dispatch).
    for (const lvl of ESCALATION_POLICY) await addHistory(inc.id, "simulation_preview", `Would escalate L${lvl.level} → ${lvl.notify} via ${lvl.channels.join(", ")} at +${lvl.afterMinutes}m`);
    return { ok: true, number: inc.number };
  } catch { return { ok: false }; }
}

/** Delete a simulation incident (drill cleanup) — only simulations may be deleted. */
export async function deleteSimulation(number: string, actor: Actor): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: inc } = await db().from("incidents").select("id,is_simulation").eq("number", number).maybeSingle();
    if (!inc) return { ok: false, error: "Not found." };
    if (!inc.is_simulation) return { ok: false, error: "Only simulation incidents can be deleted." };
    await db().from("incidents").delete().eq("id", inc.id);   // cascades children
    return { ok: true };
  } catch { return { ok: false, error: "Delete failed." }; }
}

// ── Suppression rules + maintenance windows (operator-managed, configurable) ─────
export interface SuppressionRule { id: string; reason: string; category: string | null; subsystem: string | null; rootCauseSystem: string | null; reasonPattern: string | null; startsAt: string | null; endsAt: string | null; enabled: boolean; createdBy: string | null; createdAt: string }
export async function listSuppressionRules(): Promise<SuppressionRule[]> {
  try {
    const { data } = await db().from("incident_suppression_rules").select("*").order("created_at", { ascending: false });
    return ((data ?? []) as any[]).map((r) => ({ id: r.id, reason: r.reason, category: r.category ?? null, subsystem: r.subsystem ?? null, rootCauseSystem: r.root_cause_system ?? null, reasonPattern: r.reason_pattern ?? null, startsAt: r.starts_at ?? null, endsAt: r.ends_at ?? null, enabled: r.enabled, createdBy: r.created_by ?? null, createdAt: r.created_at }));
  } catch { return []; }
}
export async function createSuppressionRule(input: { reason: string; category?: string | null; subsystem?: string | null; rootCauseSystem?: string | null; reasonPattern?: string | null; startsAt?: string | null; endsAt?: string | null }, actor: Actor): Promise<{ ok: boolean; error?: string }> {
  if (!input.reason?.trim()) return { ok: false, error: "A reason is required." };
  try {
    await db().from("incident_suppression_rules").insert({ reason: input.reason.trim(), category: input.category || null, subsystem: input.subsystem || null, root_cause_system: input.rootCauseSystem || null, reason_pattern: input.reasonPattern || null, starts_at: input.startsAt || null, ends_at: input.endsAt || null, created_by: actor.name });
    return { ok: true };
  } catch { return { ok: false, error: "Create failed." }; }
}
export async function setSuppressionEnabled(id: string, enabled: boolean): Promise<{ ok: boolean }> {
  try { await db().from("incident_suppression_rules").update({ enabled }).eq("id", id); return { ok: true }; } catch { return { ok: false }; }
}
export async function deleteSuppressionRule(id: string): Promise<{ ok: boolean }> {
  try { await db().from("incident_suppression_rules").delete().eq("id", id); return { ok: true }; } catch { return { ok: false }; }
}

export interface MaintenanceWindow { id: string; title: string; rootCauseSystem: string | null; subsystem: string | null; startsAt: string; endsAt: string; reason: string | null; enabled: boolean; active: boolean; createdBy: string | null }
export async function listMaintenanceWindows(): Promise<MaintenanceWindow[]> {
  try {
    const now = Date.now();
    const { data } = await db().from("maintenance_windows").select("*").order("starts_at", { ascending: false });
    return ((data ?? []) as any[]).map((r) => ({ id: r.id, title: r.title, rootCauseSystem: r.root_cause_system ?? null, subsystem: r.subsystem ?? null, startsAt: r.starts_at, endsAt: r.ends_at, reason: r.reason ?? null, enabled: r.enabled, active: r.enabled && now >= new Date(r.starts_at).getTime() && now <= new Date(r.ends_at).getTime(), createdBy: r.created_by ?? null }));
  } catch { return []; }
}
export async function createMaintenanceWindow(input: { title: string; rootCauseSystem?: string | null; subsystem?: string | null; startsAt: string; endsAt: string; reason?: string | null }, actor: Actor): Promise<{ ok: boolean; error?: string }> {
  if (!input.title?.trim() || !input.startsAt || !input.endsAt) return { ok: false, error: "Title, start and end are required." };
  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) return { ok: false, error: "End must be after start." };
  try {
    await db().from("maintenance_windows").insert({ title: input.title.trim(), root_cause_system: input.rootCauseSystem || null, subsystem: input.subsystem || null, starts_at: input.startsAt, ends_at: input.endsAt, reason: input.reason || null, created_by: actor.name });
    return { ok: true };
  } catch { return { ok: false, error: "Create failed." }; }
}
export async function setMaintenanceEnabled(id: string, enabled: boolean): Promise<{ ok: boolean }> {
  try { await db().from("maintenance_windows").update({ enabled }).eq("id", id); return { ok: true }; } catch { return { ok: false }; }
}
export async function deleteMaintenanceWindow(id: string): Promise<{ ok: boolean }> {
  try { await db().from("maintenance_windows").delete().eq("id", id); return { ok: true }; } catch { return { ok: false }; }
}

/** DEPENDENCY GRAPH — the configured nodes/edges plus which nodes have active incidents right now. */
export interface DependencyGraph { nodes: { id: string; label: string; layer: number; active: boolean }[]; edges: { from: string; to: string }[] }
export async function getDependencyGraph(): Promise<DependencyGraph> {
  const active = new Set<string>();
  try {
    const { data } = await db().from("incidents").select("root_cause_system,subsystem").eq("is_simulation", false).in("status", ["open", "investigating", "mitigated"]);
    for (const r of (data ?? []) as any[]) { if (r.root_cause_system) active.add(r.root_cause_system); if (r.subsystem) active.add(r.subsystem); }
  } catch { /* best-effort */ }
  return {
    nodes: DEPENDENCY_NODES.map((n) => ({ id: n.id, label: n.label, layer: n.layer, active: active.has(n.id) })),
    edges: DEPENDENCY_EDGES.map((e) => ({ from: e.from, to: e.to })),
  };
}
