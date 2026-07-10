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
export interface AdminAlert { key: string; severity: AlertSeverity; title: string; count: number; href: string }

export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const db = createAdminClient() as any;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const alerts: AdminAlert[] = [];
  const cnt = async (build: () => Promise<{ count: number | null }>): Promise<number> => { try { return (await build()).count ?? 0; } catch { return 0; } };

  // Low stock (active variants at/below threshold) — computed in JS (column-vs-column).
  try {
    const { data } = await db.from("variants").select("stock,low_stock_threshold,is_active").eq("is_active", true);
    const low = (data ?? []).filter((v: any) => Number(v.stock) <= Number(v.low_stock_threshold ?? 0)).length;
    if (low) alerts.push({ key: "low_stock", severity: "warn", title: "Low-stock variants", count: low, href: "/admin/products" });
  } catch { /* ignore */ }

  const [returnsPending, shipExceptions, refundFailed, payFailed, emailFailed, jobsFailed] = await Promise.all([
    cnt(() => db.from("returns").select("id", { count: "exact", head: true }).eq("status", "requested")),
    cnt(() => db.from("shipments").select("id", { count: "exact", head: true }).eq("status", "exception")),
    cnt(() => db.from("refunds").select("id", { count: "exact", head: true }).eq("status", "failed")),
    cnt(() => db.from("payment_attempts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", weekAgo)),
    cnt(() => db.from("notification_dispatches").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", weekAgo)),
    cnt(() => db.from("fulfillment_jobs").select("id", { count: "exact", head: true }).eq("status", "failed")),
  ]);

  if (returnsPending) alerts.push({ key: "returns_pending", severity: "info", title: "Return requests awaiting review", count: returnsPending, href: "/admin/returns" });
  if (shipExceptions) alerts.push({ key: "shipment_exception", severity: "warn", title: "Shipments in exception (NDR)", count: shipExceptions, href: "/admin/shipments" });
  if (refundFailed) alerts.push({ key: "refund_failed", severity: "critical", title: "Refunds failed", count: refundFailed, href: "/admin/orders" });
  if (payFailed) alerts.push({ key: "failed_payments", severity: "warn", title: "Failed payments (7d)", count: payFailed, href: "/admin/orders?payment=failed" });
  if (emailFailed) alerts.push({ key: "email_failed", severity: "warn", title: "Failed customer emails (7d)", count: emailFailed, href: "/admin/audit?search=email" });
  if (jobsFailed) alerts.push({ key: "jobs_failed", severity: "critical", title: "Failed background jobs", count: jobsFailed, href: "/admin/health" });

  const rank: Record<AlertSeverity, number> = { critical: 0, warn: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
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

/** Both classes for the notification center page. */
export async function getNotificationCenter(): Promise<{ operational: AdminAlert[]; events: EventNotification[]; unreadEvents: number }> {
  const [operational, events] = await Promise.all([getAdminAlerts(), getEventNotifications({ limit: 50 })]);
  return { operational, events, unreadEvents: events.filter((e) => !e.readAt).length };
}

/** Nav badge — standing operational alerts (one per condition) + unread events. */
export async function getAlertCount(): Promise<number> {
  const [alerts, unread] = await Promise.all([getAdminAlerts(), unreadEventCount()]);
  return alerts.length + unread;
}
