/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin notification center (R6) — TWO classes, one screen:
 *
 *  1. OPERATIONAL (derived) — `getAdminAlerts()`. Standing conditions computed live
 *     from the source tables ("5 returns awaiting review"). Always current, no push
 *     table, self-clears when the work is done.
 *
 *  2. EVENT (recorded) — `admin_notifications`. One-time real events that NO query
 *     can reconstruct ("a customer replied", "wholesale enquiry", "media processing
 *     failed", "newsletter import finished"). Producers call `emitNotification()`
 *     when the thing happens; each row is an inbox item that gets read/dismissed.
 *
 * The two are deliberately different mechanisms because they're different kinds of
 * truth: a condition you can re-derive vs an event you had to witness.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type AlertSeverity = "info" | "warn" | "critical";
/** 4-tier operational priority (review point 6). */
export type AlertPriority = "critical" | "high" | "medium" | "info";

/** One concrete item behind an alert — carries the context that answers "which order?"
 *  and a deep-link to the exact place to act (review points 2, 3, 7, 10). */
export type NotificationState = "open" | "acknowledged" | "in_progress" | "resolved";

export interface AlertItem {
  id: string;
  alertKey: string;             // stable per-item key for workflow state (points 5, 8)
  primary: string;              // order number / product / RMA
  secondary?: string;           // customer / SKU / order
  meta?: string;                // ₹amount · failure reason
  at: string | null;            // ISO timestamp → "3 min ago"
  href: string;                 // deep-link to the exact order + section
  retryOrderNumber?: string;    // set when a Retry Refund action applies
  state?: NotificationState;    // acknowledged / investigating (from notification_state)
  assigneeName?: string | null; // "Rahul" — so others don't duplicate
  notId?: string;               // stable support reference "NOT-XXXXX" (point 8.3)
  subsystem?: string;           // searchable subsystem tag (point 1)
  isSnoozed?: boolean;          // currently snoozed (hidden by default; shown under "Snoozed")
  incidentNumber?: string;      // "INC-00014" when this notification belongs to an incident
}

/** Deterministic short support reference for an alert item (review point 8.3). */
export function notificationId(alertKey: string): string {
  let h = 2166136261;
  for (let i = 0; i < alertKey.length; i++) { h ^= alertKey.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `NOT-${(h >>> 0).toString(36).toUpperCase().padStart(5, "0").slice(0, 5)}`;
}

/** Subsystem keyword per alert key — operators search by subsystem, not order number (point 1). */
const SUBSYSTEM: Record<string, string> = {
  refund_failed: "razorpay gateway refund payment",
  failed_payments: "razorpay gateway payment",
  shipment_exception: "shiprocket shipment logistics ndr",
  returns_pending: "returns rma",
  low_stock: "inventory stock",
  email_failed: "email resend notification",
  jobs_failed: "jobs background worker",
};

export interface AdminAlert {
  key: string;
  severity: AlertSeverity;      // retained for back-compat
  priority: AlertPriority;      // 4-tier display/sort
  title: string;
  count: number;
  href: string;                 // "review all" fallback
  items: AlertItem[];           // enriched per-item context
}

const inr = (n: unknown) => `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;

/** Operational alerts, ENRICHED with per-item context + deep-links. Derived live from the
 *  source tables → self-clears when the work is done (auto-resolve). */
export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const db = createAdminClient() as any;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const alerts: AdminAlert[] = [];

  const [variantsRes, returnsRes, shipRes, refundRes, payRes, emailFailed, jobsFailed] = await Promise.all([
    db.from("variants").select("id,sku,stock,low_stock_threshold,products(name)").eq("is_active", true),
    db.from("returns").select("id,rma_number,order_number,reason,created_at").eq("status", "requested").order("created_at", { ascending: false }).limit(20),
    db.from("shipments").select("id,order_number,exception_reason,updated_at").eq("status", "exception").order("updated_at", { ascending: false }).limit(20),
    db.from("refunds").select("id,amount,reason,error_description,created_at,orders!inner(order_number,ship_full_name,total_amount)").eq("status", "failed").order("created_at", { ascending: false }).limit(20),
    db.from("payment_attempts").select("id,razorpay_order_id,error_description,created_at,orders(order_number)").eq("status", "failed").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(20),
    db.from("notification_dispatches").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", weekAgo).then((r: any) => r.count ?? 0).catch(() => 0),
    db.from("fulfillment_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").then((r: any) => r.count ?? 0).catch(() => 0),
  ]);

  // Low stock (medium)
  const low = ((variantsRes.data ?? []) as any[]).filter((v) => Number(v.stock) <= Number(v.low_stock_threshold ?? 0));
  if (low.length) alerts.push({
    key: "low_stock", severity: "warn", priority: "medium", title: "Low-stock variants", count: low.length, href: "/admin/products",
    items: low.slice(0, 12).map((v) => ({ id: v.id, alertKey: `low_stock:${v.id}`, primary: v.products?.name ?? "Variant", secondary: v.sku ?? undefined, meta: `${Number(v.stock)} left`, at: null, href: "/admin/products" })),
  });

  // Refunds failed (high) — DEDUPED by order (review point 2): repeated failures on one
  // order collapse into a single item with an occurrence count + latest failure time.
  const refunds = (refundRes.data ?? []) as any[];
  if (refunds.length) {
    const byOrder = new Map<string, { num: string; customer?: string; amount: number; reason: string; latest: string; count: number; id: string }>();
    for (const r of refunds) {
      const num = r.orders?.order_number ?? "—";
      const g = byOrder.get(num);
      const reason = r.error_description || r.reason || "gateway error";
      if (!g) byOrder.set(num, { num, customer: r.orders?.ship_full_name ?? undefined, amount: Number(r.amount ?? 0), reason, latest: r.created_at, count: 1, id: r.id });
      else { g.count++; if (new Date(r.created_at) > new Date(g.latest)) { g.latest = r.created_at; g.reason = reason; } }
    }
    alerts.push({
      key: "refund_failed", severity: "critical", priority: "high", title: "Refund failed", count: byOrder.size, href: "/admin/orders?payment=failed",
      items: [...byOrder.values()].map((g) => ({ id: g.id, alertKey: `refund_failed:order:${g.num}`, primary: g.num, secondary: g.customer, meta: `${inr(g.amount)} · ${g.reason}${g.count > 1 ? ` · ${g.count}×` : ""}`, at: g.latest, href: `/admin/orders/${g.num}#refunds`, retryOrderNumber: g.num })),
    });
  }

  // Failed payments (high) — deduped by order
  const pays = (payRes.data ?? []) as any[];
  if (pays.length) {
    const byKey = new Map<string, { key: string; num: string | null; reason: string; latest: string; count: number; id: string }>();
    for (const p of pays) {
      const num = p.orders?.order_number ?? null;
      const k = num ?? p.razorpay_order_id ?? p.id;
      const g = byKey.get(k);
      const reason = p.error_description || "payment failed";
      if (!g) byKey.set(k, { key: k, num, reason, latest: p.created_at, count: 1, id: p.id });
      else { g.count++; if (new Date(p.created_at) > new Date(g.latest)) { g.latest = p.created_at; g.reason = reason; } }
    }
    alerts.push({
      key: "failed_payments", severity: "warn", priority: "high", title: "Failed payments (7d)", count: byKey.size, href: "/admin/orders?payment=failed",
      items: [...byKey.values()].map((g) => ({ id: g.id, alertKey: `failed_payments:${g.key}`, primary: g.num ?? g.key, secondary: g.num ? undefined : "no order", meta: `${g.reason}${g.count > 1 ? ` · ${g.count}×` : ""}`, at: g.latest, href: g.num ? `/admin/orders/${g.num}` : "/admin/orders?payment=failed" })),
    });
  }

  // Shipment exceptions / NDR (medium)
  const ships = (shipRes.data ?? []) as any[];
  if (ships.length) alerts.push({
    key: "shipment_exception", severity: "warn", priority: "medium", title: "Shipments in exception (NDR)", count: ships.length, href: "/admin/shipments",
    items: ships.map((s) => ({ id: s.id, alertKey: `shipment_exception:${s.id}`, primary: s.order_number ?? "—", meta: s.exception_reason || "exception", at: s.updated_at, href: s.order_number ? `/admin/orders/${s.order_number}` : "/admin/shipments" })),
  });

  // Return requests awaiting review (info)
  const returns = (returnsRes.data ?? []) as any[];
  if (returns.length) alerts.push({
    key: "returns_pending", severity: "info", priority: "info", title: "Return requests awaiting review", count: returns.length, href: "/admin/returns",
    items: returns.map((r) => ({ id: r.id, alertKey: `returns_pending:${r.id}`, primary: r.rma_number ?? r.order_number ?? "RMA", secondary: r.order_number ?? undefined, meta: r.reason || undefined, at: r.created_at, href: "/admin/returns" })),
  });

  // Failed customer emails (medium) — count only
  if (emailFailed) alerts.push({ key: "email_failed", severity: "warn", priority: "medium", title: "Failed customer emails (7d)", count: emailFailed, href: "/admin/audit?search=email", items: [] });
  // Failed background jobs (critical)
  if (jobsFailed) alerts.push({ key: "jobs_failed", severity: "critical", priority: "critical", title: "Failed background jobs", count: jobsFailed, href: "/admin/health", items: [] });

  // Attach workflow state (assignee/ack) + drop snoozed items (review points 5, 8, 11).
  const allItems = alerts.flatMap((a) => a.items);
  if (allItems.length) {
    try {
      const nowMs = Date.now();
      const { data: states } = await db.from("notification_state").select("alert_key,state,assignee_name,snoozed_until").in("alert_key", allItems.map((i) => i.alertKey));
      const byKey = new Map<string, any>((states ?? []).map((s: any) => [String(s.alert_key), s]));
      for (const a of alerts) {
        for (const it of a.items) {
          const s = byKey.get(it.alertKey);
          if (s) { it.state = s.state as NotificationState; it.assigneeName = s.assignee_name; it.isSnoozed = !!(s.snoozed_until && new Date(s.snoozed_until).getTime() > nowMs); }
          it.notId = notificationId(it.alertKey);
          it.subsystem = SUBSYSTEM[a.key];
        }
      }
    } catch { /* state is best-effort */ }
  }

  const rank: Record<AlertPriority, number> = { critical: 0, high: 1, medium: 2, info: 3 };
  return alerts.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

/** At-a-glance metrics + operational health (review points 6, 8.4, 8.5, 14). */
export interface NotificationMetrics {
  openOps: number;
  breakdown: { critical: number; high: number; medium: number; info: number };
  status: "healthy" | "attention" | "critical";
  unreadEvents: number;
  resolvedToday: number;
  avgResolutionMin: number | null;
  oldestUnresolvedMin: number | null;                                  // point 6
  resolutionByCategory: { category: string; minutes: number | null }[]; // point 8.5
}
export async function getNotificationMetrics(): Promise<NotificationMetrics> {
  const [alerts, unread, resolved, avg, byCat] = await Promise.all([
    getAdminAlerts(), unreadEventCount(), getResolvedToday(), pairedAvgMinutes("refund.initiated", "refund.processed", 2),
    resolutionByCategory(),
  ]);
  const breakdown = { critical: 0, high: 0, medium: 0, info: 0 };
  let oldest: number | null = null;
  for (const a of alerts) {
    breakdown[a.priority] += a.count;
    for (const it of a.items) if (it.at) { const age = (Date.now() - new Date(it.at).getTime()) / 60000; if (oldest == null || age > oldest) oldest = age; }
  }
  const status = breakdown.critical > 0 ? "critical" : breakdown.high > 0 ? "attention" : "healthy";
  return {
    openOps: alerts.length, breakdown, status, unreadEvents: unread, resolvedToday: resolved.length,
    avgResolutionMin: avg, oldestUnresolvedMin: oldest == null ? null : Math.round(oldest), resolutionByCategory: byCat,
  };
}

/** Mean minutes between a paired start/end audit event, per order, over the last `days`. */
async function pairedAvgMinutes(startEvent: string, endEvent: string, days: number): Promise<number | null> {
  try {
    const db = createAdminClient() as any;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await db.from("audit_events").select("order_id,event,created_at").in("event", [startEvent, endEvent]).gte("created_at", since).order("created_at", { ascending: true }).limit(800);
    const opened = new Map<string, number>();
    const spans: number[] = [];
    for (const e of (data ?? []) as any[]) {
      if (e.event === startEvent) opened.set(e.order_id, new Date(e.created_at).getTime());
      else if (e.event === endEvent && opened.has(e.order_id)) { spans.push((new Date(e.created_at).getTime() - (opened.get(e.order_id) as number)) / 60000); opened.delete(e.order_id); }
    }
    if (!spans.length) return null;
    return Math.round(spans.reduce((a, b) => a + b, 0) / spans.length);
  } catch { return null; }
}

/** Average resolution time split by category (review point 8.5) — where paired events exist. */
async function resolutionByCategory(): Promise<{ category: string; minutes: number | null }[]> {
  const [refund, ret, ship] = await Promise.all([
    pairedAvgMinutes("refund.initiated", "refund.processed", 30),
    pairedAvgMinutes("return.requested", "return.closed", 30),
    pairedAvgMinutes("order.confirmed", "shipment.dispatched", 7),
  ]);
  return [{ category: "Refund", minutes: refund }, { category: "Shipment", minutes: ship }, { category: "Return", minutes: ret }];
}

/** Incident correlation MVP (review point 7) — no engine, just a windowed count. If gateway
 *  errors spike (N+ failed refunds/payments with a gateway/timeout/network reason in the last
 *  few minutes), flag a likely payment-gateway incident so the noise reads as one event. */
export interface Incident { active: boolean; count: number; windowMin: number; label: string }
const INCIDENT_THRESHOLD = 6;
const INCIDENT_WINDOW_MIN = 10;
export async function getIncident(): Promise<Incident> {
  const base = { active: false, count: 0, windowMin: INCIDENT_WINDOW_MIN, label: "Payment gateway incident" };
  try {
    const db = createAdminClient() as any;
    const since = new Date(Date.now() - INCIDENT_WINDOW_MIN * 60000).toISOString();
    const [rf, pf] = await Promise.all([
      db.from("refunds").select("error_description,reason,created_at").eq("status", "failed").gte("created_at", since),
      db.from("payment_attempts").select("error_description,created_at").eq("status", "failed").gte("created_at", since),
    ]);
    const isGateway = (s: string | null | undefined) => /timeout|gateway|network|unavailable|5\d\d/i.test(s ?? "");
    const count = [...((rf.data ?? []) as any[]), ...((pf.data ?? []) as any[])].filter((x) => isGateway(x.error_description || x.reason)).length;
    return { ...base, active: count >= INCIDENT_THRESHOLD, count };
  } catch { return base; }
}

/** Notification trends (review point 8.6) — this 30d vs the prior 30d, per category. Turns the
 *  page from reactive to strategic ("refund failures down 38%"). */
export interface Trend { label: string; current: number; prior: number; deltaPct: number | null }
export async function getNotificationTrends(): Promise<Trend[]> {
  try {
    const db = createAdminClient() as any;
    const c30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const c60 = new Date(Date.now() - 60 * 86400000).toISOString();
    const head = async (build: () => Promise<{ count: number | null }>) => { try { return (await build()).count ?? 0; } catch { return 0; } };
    const window = async (table: string, statusCol: string, statusVal: string) => {
      const [cur, pri] = await Promise.all([
        head(() => db.from(table).select("id", { count: "exact", head: true }).eq(statusCol, statusVal).gte("created_at", c30)),
        head(() => db.from(table).select("id", { count: "exact", head: true }).eq(statusCol, statusVal).gte("created_at", c60).lt("created_at", c30)),
      ]);
      return { cur, pri };
    };
    const [refund, ship, pay] = await Promise.all([
      window("refunds", "status", "failed"),
      window("shipments", "status", "exception"),
      window("payment_attempts", "status", "failed"),
    ]);
    const delta = (cur: number, pri: number) => (pri > 0 ? Math.round(((cur - pri) / pri) * 100) : null);
    return [
      { label: "Refund failures", current: refund.cur, prior: refund.pri, deltaPct: delta(refund.cur, refund.pri) },
      { label: "Shipment failures", current: ship.cur, prior: ship.pri, deltaPct: delta(ship.cur, ship.pri) },
      { label: "Payment failures", current: pay.cur, prior: pay.pri, deltaPct: delta(pay.cur, pay.pri) },
    ];
  } catch { return []; }
}

/** Set the workflow state of one or MANY alert items (acknowledge / claim / snooze / bulk —
 *  review points 3, 5, 8, 11). Pass `alertKeys` for a bulk operation. */
export async function setNotificationState(input: { alertKey?: string; alertKeys?: string[]; state: NotificationState; assigneeId?: string | null; assigneeName?: string | null; note?: string; updatedBy?: string | null; snoozedUntil?: string | null }): Promise<{ ok: boolean; reason?: string }> {
  try {
    const db = createAdminClient() as any;
    const keys = input.alertKeys?.length ? input.alertKeys : input.alertKey ? [input.alertKey] : [];
    if (!keys.length) return { ok: false, reason: "no keys" };
    const now = new Date().toISOString();
    const rows = keys.map((k) => ({ alert_key: k, state: input.state, assignee_id: input.assigneeId ?? null, assignee_name: input.assigneeName ?? null, note: input.note ?? null, updated_by: input.updatedBy ?? null, snoozed_until: input.snoozedUntil ?? null, updated_at: now }));
    const { error } = await db.from("notification_state").upsert(rows, { onConflict: "alert_key" });
    return error ? { ok: false, reason: error.message } : { ok: true };
  } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : "failed" }; }
}

/** Resolutions recorded today (review points 14, 17) — derived from the audit log, so it
 *  reflects what actually got fixed (refunds processed, orders dispatched, returns closed). */
export interface ResolvedItem { id: string; label: string; orderNumber: string | null; at: string }
export async function getResolvedToday(): Promise<ResolvedItem[]> {
  try {
    const db = createAdminClient() as any;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const RESOLVE_EVENTS = ["refund.processed", "shipment.dispatched", "return.closed", "shipment.delivered"];
    const { data } = await db.from("audit_events").select("id,event,order_id,created_at").in("event", RESOLVE_EVENTS).gte("created_at", start.toISOString()).order("created_at", { ascending: false }).limit(20);
    const rows = (data ?? []) as any[];
    const ids = [...new Set(rows.map((r) => r.order_id).filter(Boolean))];
    const numById = new Map<string, string>();
    if (ids.length) { const { data: os } = await db.from("orders").select("id,order_number").in("id", ids); for (const o of os ?? []) numById.set(o.id, o.order_number); }
    const LABEL: Record<string, string> = { "refund.processed": "Refund processed", "shipment.dispatched": "Order dispatched", "return.closed": "Return closed", "shipment.delivered": "Order delivered" };
    return rows.map((r) => ({ id: r.id, label: LABEL[r.event] ?? r.event, orderNumber: r.order_id ? numById.get(r.order_id) ?? null : null, at: r.created_at }));
  } catch { return []; }
}

// ── Event notifications (class 2) ────────────────────────────────────────────
export interface EventNotification {
  id: string; kind: string; severity: AlertSeverity; title: string; body: string | null;
  href: string | null; entityType: string | null; entityId: string | null; readAt: string | null; createdAt: string;
}
export interface EmitInput {
  kind: string; severity?: AlertSeverity; title: string; body?: string; href?: string;
  entityType?: string; entityId?: string;
}

/**
 * Record an event notification. The producer API every future feature calls when
 * something noteworthy happens (wholesale enquiry, customer reply, media failure,
 * import done). NON-BLOCKING — like logEvent, a notification failure must never
 * break the action that triggered it.
 */
export async function emitNotification(input: EmitInput): Promise<void> {
  try {
    const db = createAdminClient() as any;
    await db.from("admin_notifications").insert({
      kind: input.kind, severity: input.severity ?? "info", title: input.title, body: input.body ?? null,
      href: input.href ?? null, entity_type: input.entityType ?? null, entity_id: input.entityId ?? null,
    });
  } catch (e) {
    console.error("emitNotification failed (non-fatal)", e);
  }
}

const mapEvent = (r: any): EventNotification => ({
  id: r.id, kind: r.kind, severity: r.severity, title: r.title, body: r.body ?? null, href: r.href ?? null,
  entityType: r.entity_type ?? null, entityId: r.entity_id ?? null, readAt: r.read_at ?? null, createdAt: r.created_at,
});

/** Event notifications, newest first (optionally unread-only). */
export async function getEventNotifications(opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<EventNotification[]> {
  try {
    const db = createAdminClient() as any;
    let q = db.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 50);
    if (opts.unreadOnly) q = q.is("read_at", null);
    const { data } = await q;
    return (data ?? []).map(mapEvent);
  } catch { return []; }
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const db = createAdminClient() as any;
    const { error } = await db.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    return error ? { ok: false, reason: error.message } : { ok: true };
  } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : "failed" }; }
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const db = createAdminClient() as any;
    const { error } = await db.from("admin_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    return error ? { ok: false, reason: error.message } : { ok: true };
  } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : "failed" }; }
}

async function unreadEventCount(): Promise<number> {
  try {
    const db = createAdminClient() as any;
    const { count } = await db.from("admin_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
    return count ?? 0;
  } catch { return 0; }
}

/** Both classes + resolutions for the notification center page. */
export async function getNotificationCenter(): Promise<{ operational: AdminAlert[]; events: EventNotification[]; resolved: ResolvedItem[]; unreadEvents: number }> {
  const [operational, events, resolved] = await Promise.all([getAdminAlerts(), getEventNotifications({ limit: 50 }), getResolvedToday()]);
  return { operational, events, resolved, unreadEvents: events.filter((e) => !e.readAt).length };
}

/** Nav badge (review point 15) — OPEN operational conditions + unread events only (read
 *  events never count). Uses lightweight head-counts (runs on every admin page). */
export async function getAlertCount(): Promise<number> {
  const db = createAdminClient() as any;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const head = async (build: () => Promise<{ count: number | null }>): Promise<number> => { try { return (await build()).count ?? 0; } catch { return 0; } };
  const [lowRes, returnsC, shipC, refundC, payC, emailC, jobsC, unread] = await Promise.all([
    db.from("variants").select("stock,low_stock_threshold").eq("is_active", true),
    head(() => db.from("returns").select("id", { count: "exact", head: true }).eq("status", "requested")),
    head(() => db.from("shipments").select("id", { count: "exact", head: true }).eq("status", "exception")),
    head(() => db.from("refunds").select("id", { count: "exact", head: true }).eq("status", "failed")),
    head(() => db.from("payment_attempts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", weekAgo)),
    head(() => db.from("notification_dispatches").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", weekAgo)),
    head(() => db.from("fulfillment_jobs").select("id", { count: "exact", head: true }).eq("status", "failed")),
    unreadEventCount(),
  ]);
  const lowStock = ((lowRes.data ?? []) as any[]).some((v) => Number(v.stock) <= Number(v.low_stock_threshold ?? 0)) ? 1 : 0;
  // Count of OPEN operational conditions (one per active alert type) + unread events.
  const conditions = lowStock + [returnsC, shipC, refundC, payC, emailC, jobsC].filter((n) => n > 0).length;
  return conditions + unread;
}
