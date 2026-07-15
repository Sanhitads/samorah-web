/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Incident service — the DB-facing orchestration on top of the pure rule engine
 * (`lib/incidents/engine`). Correlates notifications into incidents, auto-resolves them, and
 * serves the incident list/detail/metrics. Deterministic, no AI. Notifications are untouched:
 * an incident references them by their stable `alert_key`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { INCIDENT_RULES, INCIDENT_CATEGORY_LABEL, type IncidentRule, type IncidentSeverity } from "@/config/incidents";
import { highestSeverity, ruleTriggered, matchesReason, shouldMergeInto, allNotificationsResolved, incidentTitle } from "@/lib/incidents/engine";

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

/** Recompute derived fields (severity from highest notification, counts, last activity). */
async function recompute(incidentId: string): Promise<void> {
  const { data: notifs } = await db().from("incident_notifications").select("order_number,severity,resolved_at").eq("incident_id", incidentId);
  const rows = (notifs ?? []) as any[];
  const open = rows.filter((n) => !n.resolved_at);
  const severity = highestSeverity((open.length ? open : rows).map((n) => (n.severity ?? "info") as IncidentSeverity));
  const orders = new Set(rows.map((n) => n.order_number).filter(Boolean));
  await db().from("incidents").update({ severity, affected_notifications: rows.length, affected_orders: orders.size, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", incidentId);
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
        root_cause: rule.rootCauseLabel, source_system: rule.sourceSystem, rule_id: rule.id,
        description: `Correlated by rule "${rule.id}" — ${rows.length} events within ${rule.windowMinutes} min.`,
      }).select("id").single();
      incidentId = newInc.id;
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
  status: string; rootCause: string | null; sourceSystem: string | null; assigneeName: string | null;
  affectedOrders: number; affectedNotifications: number; startedAt: string; lastActivityAt: string; resolvedAt: string | null;
}
const mapIncident = (r: any): IncidentRow => ({
  id: r.id, number: r.number, title: r.title, category: r.category, categoryLabel: INCIDENT_CATEGORY_LABEL[r.category as keyof typeof INCIDENT_CATEGORY_LABEL] ?? r.category,
  severity: r.severity, status: r.status, rootCause: r.root_cause ?? null, sourceSystem: r.source_system ?? null, assigneeName: r.assignee_name ?? null,
  affectedOrders: r.affected_orders ?? 0, affectedNotifications: r.affected_notifications ?? 0, startedAt: r.started_at, lastActivityAt: r.last_activity_at, resolvedAt: r.resolved_at ?? null,
});

export async function getIncidents(opts: { status?: "active" | "all"; limit?: number } = {}): Promise<IncidentRow[]> {
  try {
    let q = db().from("incidents").select("*").order("last_activity_at", { ascending: false }).limit(opts.limit ?? 100);
    if (opts.status === "active" || !opts.status) q = q.in("status", ["open", "investigating", "mitigated"]);
    const { data } = await q;
    return (data ?? []).map(mapIncident);
  } catch { return []; }
}

export interface IncidentDetail extends IncidentRow {
  description: string | null; resolutionNotes: string | null;
  notifications: { alertKey: string; orderNumber: string | null; severity: string | null; addedAt: string; resolvedAt: string | null }[];
  orders: string[];
  history: { event: string; detail: string | null; actorName: string | null; createdAt: string }[];
  related: { number: string; title: string; status: string }[];
}
export async function getIncidentByNumber(number: string): Promise<IncidentDetail | null> {
  try {
    const { data: inc } = await db().from("incidents").select("*").eq("number", number).maybeSingle();
    if (!inc) return null;
    const [{ data: notifs }, { data: hist }, { data: related }] = await Promise.all([
      db().from("incident_notifications").select("alert_key,order_number,severity,added_at,resolved_at").eq("incident_id", inc.id).order("added_at", { ascending: true }),
      db().from("incident_history").select("event,detail,actor_name,created_at").eq("incident_id", inc.id).order("created_at", { ascending: true }),
      db().from("incidents").select("number,title,status").eq("category", inc.category).neq("id", inc.id).order("last_activity_at", { ascending: false }).limit(5),
    ]);
    const orders = [...new Set((notifs ?? []).map((n: any) => n.order_number).filter(Boolean))] as string[];
    return {
      ...mapIncident(inc), description: inc.description ?? null, resolutionNotes: inc.resolution_notes ?? null,
      notifications: (notifs ?? []).map((n: any) => ({ alertKey: n.alert_key, orderNumber: n.order_number ?? null, severity: n.severity ?? null, addedAt: n.added_at, resolvedAt: n.resolved_at ?? null })),
      orders,
      history: (hist ?? []).map((h: any) => ({ event: h.event, detail: h.detail ?? null, actorName: h.actor_name ?? null, createdAt: h.created_at })),
      related: (related ?? []).map((r: any) => ({ number: r.number, title: r.title, status: r.status })),
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

// ── Mutations ────────────────────────────────────────────────────────────────
export async function assignIncident(number: string, staff: { id: string | null; name: string }): Promise<{ ok: boolean }> {
  try {
    const { data: inc } = await db().from("incidents").select("id").eq("number", number).maybeSingle();
    if (!inc) return { ok: false };
    await db().from("incidents").update({ assignee_id: staff.id, assignee_name: staff.name, last_activity_at: new Date().toISOString() }).eq("id", inc.id);
    await addHistory(inc.id, "assigned", staff.name, { id: staff.id, name: staff.name });
    return { ok: true };
  } catch { return { ok: false }; }
}
export async function setIncidentStatus(number: string, status: string, actor: { id: string | null; name: string }): Promise<{ ok: boolean }> {
  try {
    const { data: inc } = await db().from("incidents").select("id,status").eq("number", number).maybeSingle();
    if (!inc) return { ok: false };
    const patch: any = { status, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (status === "resolved" || status === "closed") patch.resolved_at = new Date().toISOString();
    await db().from("incidents").update(patch).eq("id", inc.id);
    await addHistory(inc.id, "status_changed", `${inc.status} → ${status}`, actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
export async function addIncidentNote(number: string, note: string, actor: { id: string | null; name: string }): Promise<{ ok: boolean }> {
  try {
    const { data: inc } = await db().from("incidents").select("id").eq("number", number).maybeSingle();
    if (!inc) return { ok: false };
    await db().from("incidents").update({ resolution_notes: note, last_activity_at: new Date().toISOString() }).eq("id", inc.id);
    await addHistory(inc.id, "note_added", note.slice(0, 200), actor);
    return { ok: true };
  } catch { return { ok: false }; }
}
