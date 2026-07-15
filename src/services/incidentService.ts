/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Incident service — the DB-facing orchestration on top of the pure rule engine
 * (`lib/incidents/engine`). Correlates notifications into incidents, auto-resolves them, and
 * serves the incident list/detail/metrics. Deterministic, no AI. Notifications are untouched:
 * an incident references them by their stable `alert_key`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { INCIDENT_RULES, INCIDENT_CATEGORY_LABEL, CATEGORY_TEAM, INCIDENT_CHECKLISTS, type IncidentRule, type IncidentSeverity, type IncidentCategory } from "@/config/incidents";
import { highestSeverity, ruleTriggered, matchesReason, shouldMergeInto, allNotificationsResolved, incidentTitle, matchesIncidentSearch } from "@/lib/incidents/engine";

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
 *  notification UNLESS a human has locked it via a manual severity change). */
async function recompute(incidentId: string): Promise<void> {
  const [{ data: inc }, { data: notifs }] = await Promise.all([
    db().from("incidents").select("severity_locked").eq("id", incidentId).maybeSingle(),
    db().from("incident_notifications").select("order_number,severity,resolved_at").eq("incident_id", incidentId),
  ]);
  const rows = (notifs ?? []) as any[];
  const open = rows.filter((n) => !n.resolved_at);
  const orders = new Set(rows.map((n) => n.order_number).filter(Boolean));
  const patch: any = { affected_notifications: rows.length, affected_orders: orders.size, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (!inc?.severity_locked) patch.severity = highestSeverity((open.length ? open : rows).map((n) => (n.severity ?? "info") as IncidentSeverity));
  await db().from("incidents").update(patch).eq("id", incidentId);
}

/** Seed the configurable checklist template for a new incident's category (Phase 2). */
async function seedChecklist(incidentId: string, category: IncidentCategory): Promise<void> {
  const items = INCIDENT_CHECKLISTS[category];
  if (!items?.length) return;
  try { await db().from("incident_checklist_items").insert(items.map((label, i) => ({ incident_id: incidentId, label, sort_order: i }))); } catch { /* non-fatal */ }
}

export interface CorrelationResult { created: number; merged: number; attached: number; resolved: number }

/** Run every rule → open/merge incidents, then auto-resolve. Idempotent (merge prevents dupes). */
export async function correlateIncidents(): Promise<CorrelationResult> {
  const now = Date.now();
  let created = 0, merged = 0, attached = 0;

  for (const rule of INCIDENT_RULES) {
    if (!rule.enabled) continue;
    const since = new Date(now - rule.windowMinutes * 60_000).toISOString();
    const rows = (await fetchRows(rule, since)).filter((r) => matchesReason(r.reason, rule.reasonPattern));
    if (!ruleTriggered(rows.length, rule)) continue;

    const notifs = dedupeByKey(rows);

    // Find an active incident of the same category+rule to merge into.
    const { data: existing } = await db().from("incidents").select("id,category,rule_id,status,last_activity_at").eq("category", rule.category).eq("rule_id", rule.id).in("status", ["open", "investigating", "mitigated"]).order("last_activity_at", { ascending: false }).limit(1);
    const inc = (existing ?? [])[0];

    let incidentId: string;
    if (inc && shouldMergeInto({ category: inc.category, ruleId: inc.rule_id, status: inc.status, lastActivityAt: inc.last_activity_at }, rule, now)) {
      incidentId = inc.id; merged++;
    } else {
      const { data: newInc } = await db().from("incidents").insert({
        title: incidentTitle(rule, notifs.length), category: rule.category, severity: rule.notificationSeverity, status: "open",
        root_cause: rule.rootCauseLabel, source_system: rule.sourceSystem, rule_id: rule.id, team: CATEGORY_TEAM[rule.category as IncidentCategory],
        description: `Correlated by rule "${rule.id}" — ${rows.length} events within ${rule.windowMinutes} min.`,
      }).select("id").single();
      incidentId = newInc.id;
      await seedChecklist(incidentId, rule.category as IncidentCategory); // configurable template
      await addHistory(incidentId, "created", `Opened by rule ${rule.id} — ${rows.length} events in ${rule.windowMinutes}m`);
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

  const { resolved } = await autoResolveIncidents();
  return { created, merged, attached, resolved };
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

/** Mark resolved notifications; when every notification in an incident is resolved, auto-close it. */
export async function autoResolveIncidents(): Promise<{ resolved: number }> {
  const failing = await currentFailingKeys();
  const { data: active } = await db().from("incidents").select("id").in("status", ["open", "investigating", "mitigated"]);
  let resolved = 0;
  for (const inc of (active ?? []) as any[]) {
    const { data: notifs } = await db().from("incident_notifications").select("id,alert_key,resolved_at").eq("incident_id", inc.id);
    for (const n of (notifs ?? []) as any[]) {
      if (!n.resolved_at && !failing.has(n.alert_key)) {
        await db().from("incident_notifications").update({ resolved_at: new Date().toISOString() }).eq("id", n.id);
        await addHistory(inc.id, "notification_resolved", n.order_number ?? n.alert_key);
      }
    }
    const { data: after } = await db().from("incident_notifications").select("resolved_at").eq("incident_id", inc.id);
    if (allNotificationsResolved(((after ?? []) as any[]).map((n) => ({ resolvedAt: n.resolved_at })))) {
      await db().from("incidents").update({ status: "resolved", resolved_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", inc.id);
      await addHistory(inc.id, "resolved", "All notifications resolved — auto-closed");
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
}
const mapIncident = (r: any): IncidentRow => ({
  id: r.id, number: r.number, title: r.title, category: r.category, categoryLabel: INCIDENT_CATEGORY_LABEL[r.category as keyof typeof INCIDENT_CATEGORY_LABEL] ?? r.category,
  severity: r.severity, status: r.status, rootCause: r.root_cause ?? null, sourceSystem: r.source_system ?? null, team: r.team ?? null, ownerName: r.owner_name ?? null, assigneeName: r.assignee_name ?? null,
  snoozedUntil: r.snoozed_until ?? null, affectedOrders: r.affected_orders ?? 0, affectedNotifications: r.affected_notifications ?? 0, startedAt: r.started_at, lastActivityAt: r.last_activity_at, resolvedAt: r.resolved_at ?? null,
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
    if (f.severity) q = q.eq("severity", f.severity);
    if (f.category) q = q.eq("category", f.category);
    if (f.team) q = q.eq("team", f.team);
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

export interface IncidentDetail extends IncidentRow {
  description: string | null; resolutionNotes: string | null;
  notifications: { alertKey: string; orderNumber: string | null; severity: string | null; addedAt: string; resolvedAt: string | null }[];
  orders: string[];
  history: { event: string; detail: string | null; actorName: string | null; createdAt: string }[];
  related: { number: string; title: string; status: string }[];
  participants: { userId: string | null; userName: string; role: string }[];
  notes: { note: string; authorName: string | null; createdAt: string }[];
  checklist: { id: string; label: string; done: boolean; doneBy: string | null; doneAt: string | null }[];
}
export async function getIncidentByNumber(number: string): Promise<IncidentDetail | null> {
  try {
    const { data: inc } = await db().from("incidents").select("*").eq("number", number).maybeSingle();
    if (!inc) return null;
    const [{ data: notifs }, { data: hist }, { data: related }, { data: parts }, { data: notes }, { data: checklist }] = await Promise.all([
      db().from("incident_notifications").select("alert_key,order_number,severity,added_at,resolved_at").eq("incident_id", inc.id).order("added_at", { ascending: true }),
      db().from("incident_history").select("event,detail,actor_name,created_at").eq("incident_id", inc.id).order("created_at", { ascending: true }),
      db().from("incidents").select("number,title,status").eq("category", inc.category).neq("id", inc.id).order("last_activity_at", { ascending: false }).limit(5),
      db().from("incident_participants").select("user_id,user_name,role").eq("incident_id", inc.id),
      db().from("incident_notes").select("note,author_name,created_at").eq("incident_id", inc.id).order("created_at", { ascending: false }),
      db().from("incident_checklist_items").select("id,label,done,done_by,done_at").eq("incident_id", inc.id).order("sort_order", { ascending: true }),
    ]);
    const orders = [...new Set((notifs ?? []).map((n: any) => n.order_number).filter(Boolean))] as string[];
    return {
      ...mapIncident(inc), description: inc.description ?? null, resolutionNotes: inc.resolution_notes ?? null,
      notifications: (notifs ?? []).map((n: any) => ({ alertKey: n.alert_key, orderNumber: n.order_number ?? null, severity: n.severity ?? null, addedAt: n.added_at, resolvedAt: n.resolved_at ?? null })),
      orders,
      history: (hist ?? []).map((h: any) => ({ event: h.event, detail: h.detail ?? null, actorName: h.actor_name ?? null, createdAt: h.created_at })),
      related: (related ?? []).map((r: any) => ({ number: r.number, title: r.title, status: r.status })),
      participants: (parts ?? []).map((p: any) => ({ userId: p.user_id ?? null, userName: p.user_name, role: p.role })),
      notes: (notes ?? []).map((n: any) => ({ note: n.note, authorName: n.author_name ?? null, createdAt: n.created_at })),
      checklist: (checklist ?? []).map((c: any) => ({ id: c.id, label: c.label, done: c.done, doneBy: c.done_by ?? null, doneAt: c.done_at ?? null })),
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
    const { data } = await db().from("users").select("id,full_name,role").in("role", ["editor", "manager", "admin"]).order("full_name");
    return (data ?? []).map((u: any) => ({ id: u.id, name: u.full_name ?? "Staff" }));
  } catch { return []; }
}
