/**
 * Operational Notification Engine — `notifyOps(event, payload)` is the ONE entry point every
 * operational business event uses to reach staff. It resolves the event's route (which channels,
 * which Slack channel, what severity), applies per-user channel preferences, skips unconfigured
 * channels, dispatches through each while measuring latency, and records every attempt in
 * `notification_log`. Deterministic + explainable.
 *
 *   Database event → notifyOps(event, payload)
 *                       ├── In-app  (always)
 *                       ├── Email   (summaries/critical; honours per-user preferences)
 *                       ├── Slack   (operational; broadcast to a channel)
 *                       ├── SMS     (critical only)
 *                       ├── WhatsApp (future — dormant)
 *                       └── Push     (future — dormant)
 *
 * One fan-out shares a `group_id` → the Operations Center feed shows ONE item per event with its
 * channels. The customer-transactional `notify()` engine is untouched.
 */
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  OPS_ROUTES, EVENT_CATEGORY, RETENTION_DAYS, retentionClassFor,
  type OpsEvent, type OpsChannelKey, type OpsSeverity, type NotificationCategory, type DeliveryStatus,
} from "@/config/notifications";
import type { OpsChannel, OpsPayload, OpsDispatchResult } from "./opsTypes";
import { inAppChannel } from "./channels/inApp";
import { opsEmailChannel } from "./channels/opsEmail";
import { slackChannel } from "./channels/slack";
import { smsChannel } from "./channels/sms";
import { whatsappChannel } from "./channels/whatsapp";
import { pushChannel } from "./channels/push";

/** Channel registry — register a new channel by adding it here (see WhatsApp/Push stubs). */
const OPS_CHANNELS: Record<OpsChannelKey, OpsChannel> = {
  in_app: inAppChannel, email: opsEmailChannel, slack: slackChannel,
  sms: smsChannel, whatsapp: whatsappChannel, push: pushChannel,
};
const db = () => createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Which channels are live (have credentials) vs dormant — for the ops config view. */
export function channelStatus(): { key: OpsChannelKey; configured: boolean }[] {
  return (Object.keys(OPS_CHANNELS) as OpsChannelKey[]).map((key) => ({ key, configured: OPS_CHANNELS[key].configured() }));
}

/** A channel result's terminal status in the delivery lifecycle. */
const toStatus = (s: OpsDispatchResult["status"]): DeliveryStatus => (s === "sent" ? "delivered" : s === "failed" ? "failed" : "skipped");

/**
 * PER-USER PREFERENCES — applied to per-user channels only (email today; WhatsApp/push later).
 * Broadcast channels (a Slack channel) are channel-wide and unaffected. A user with an explicit
 * `enabled:false` for this event (or its category) is dropped from the recipient list.
 */
export async function resolveEmailRecipients(event: OpsEvent, category: NotificationCategory): Promise<string[]> {
  try {
    const { data: users } = await db().from("users").select("id,email").in("role", ["manager", "admin", "super_admin"]);
    const staff = ((users ?? []) as any[]).filter((u) => u.email); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!staff.length) return [];
    const { data: prefs } = await db().from("notification_preferences").select("user_id,event,category,enabled").eq("channel", "email").in("user_id", staff.map((u) => u.id));
    const optedOut = new Set(
      ((prefs ?? []) as any[]) // eslint-disable-line @typescript-eslint/no-explicit-any
        .filter((p) => p.enabled === false && (p.event === event || (p.category === category && !p.event)))
        .map((p) => p.user_id),
    );
    return staff.filter((u) => !optedOut.has(u.id)).map((u) => u.email);
  } catch { return []; }
}

interface LogCtx { groupId: string; event: OpsEvent; payload: OpsPayload; severity: OpsSeverity; category: NotificationCategory; retentionClass: string; expiresAt: string }

/** Write the row BEFORE the attempt (status `sending`) so an in-flight or crashed dispatch is
 *  visible rather than vanishing. Returns the row id to finalise. */
async function openLog(c: LogCtx, channel: OpsChannelKey, status: DeliveryStatus): Promise<string | null> {
  try {
    const { data } = await db().from("notification_log").insert({
      group_id: c.groupId, event: c.event, channel, severity: c.severity, category: c.category,
      title: c.payload.title, status,
      payload: { message: c.payload.message ?? null, fields: c.payload.fields ?? [], url: c.payload.url ?? null },
      entity_type: c.payload.entityType ?? null, entity_ref: c.payload.entityRef ?? null,
      attempts: status === "sending" ? 1 : 0, last_attempt_at: new Date().toISOString(),
      retention_class: c.retentionClass, expires_at: c.expiresAt,
    }).select("id").single();
    return data?.id ?? null;
  } catch (e) { console.error("openLog failed", e); return null; }
}

/** Finalise the row with the attempt's terminal status + measured latency. */
async function closeLog(logId: string | null, r: OpsDispatchResult, deliveryMs: number | null): Promise<void> {
  if (!logId) return;
  try {
    await db().from("notification_log").update({
      status: toStatus(r.status), target: r.target ?? null, provider_message_id: r.providerMessageId ?? null,
      error: r.error ?? null, delivery_ms: deliveryMs, last_attempt_at: new Date().toISOString(),
    }).eq("id", logId);
  } catch (e) { console.error("closeLog failed", e); }
}

export interface NotifyOpsResult { results: OpsDispatchResult[]; anyFailed: boolean; groupId: string }

/** Fan a business event out to its configured channels. `opts.channels` overrides the route (used
 *  by incident escalation, which derives channels from the escalation policy level). */
export async function notifyOps(event: OpsEvent, payload: OpsPayload, opts?: { channels?: OpsChannelKey[] }): Promise<NotifyOpsResult> {
  const route = OPS_ROUTES[event];
  const channels = opts?.channels ?? route?.channels ?? ["in_app"];
  const severity = payload.severity ?? route?.severity ?? "info";
  const category = EVENT_CATEGORY[event] ?? "system";
  const groupId = randomUUID();
  const retentionClass = retentionClassFor(event, severity, payload.entityType);
  const expiresAt = new Date(Date.now() + RETENTION_DAYS[retentionClass] * 86400000).toISOString();

  // Per-user preferences for the (per-user) email channel.
  if (channels.includes("email") && !payload.emailTo?.length) payload = { ...payload, emailTo: await resolveEmailRecipients(event, category) };

  const ctx: LogCtx = { groupId, event, payload, severity, category, retentionClass, expiresAt };
  const results: OpsDispatchResult[] = [];
  for (const key of channels) {
    const channel = OPS_CHANNELS[key];
    if (!channel) { results.push({ channel: key, status: "skipped", error: "channel not registered" }); continue; }
    if (!channel.configured()) {
      const r: OpsDispatchResult = { channel: key, status: "skipped", error: "channel not configured" };
      results.push(r);
      const id = await openLog(ctx, key, "skipped");
      await closeLog(id, r, null);   // records the reason it was skipped
      continue;
    }
    const logId = await openLog(ctx, key, "sending");   // visible in-flight
    const t0 = Date.now();
    let r: OpsDispatchResult;
    try { r = await channel.send(event, payload, severity); }
    catch (e) { r = { channel: key, status: "failed", error: e instanceof Error ? e.message : "channel error" }; }
    await closeLog(logId, r, Date.now() - t0);
    results.push(r);
  }
  return { results, anyFailed: results.some((r) => r.status === "failed"), groupId };
}

// ── Retry ──────────────────────────────────────────────────────────────────────
/** Re-attempt a single failed dispatch (e.g. Slack was briefly down). Appends to retry_history so
 *  the trail is complete; never creates a duplicate feed item. */
export async function retryDispatch(logId: string, actor: string): Promise<{ ok: boolean; status?: DeliveryStatus; error?: string }> {
  try {
    const { data: row } = await db().from("notification_log").select("*").eq("id", logId).maybeSingle();
    if (!row) return { ok: false, error: "not found" };
    if (row.status === "delivered") return { ok: false, error: "already delivered" };
    const channel = OPS_CHANNELS[row.channel as OpsChannelKey];
    if (!channel) return { ok: false, error: "channel not registered" };
    if (!channel.configured()) return { ok: false, error: "channel not configured" };

    await db().from("notification_log").update({ status: "retrying" as DeliveryStatus, last_attempt_at: new Date().toISOString() }).eq("id", logId);
    const payload: OpsPayload = {
      title: row.title ?? "(no title)", message: row.payload?.message ?? undefined,
      fields: row.payload?.fields ?? [], url: row.payload?.url ?? undefined,
      severity: row.severity, entityType: row.entity_type ?? undefined, entityRef: row.entity_ref ?? undefined,
      emailTo: row.channel === "email" && row.target ? String(row.target).split(",") : undefined,
      smsTo: row.channel === "sms" && row.target ? String(row.target).split(",") : undefined,
    };
    const t0 = Date.now();
    let r: OpsDispatchResult;
    try { r = await channel.send(row.event as OpsEvent, payload, row.severity as OpsSeverity); }
    catch (e) { r = { channel: row.channel, status: "failed", error: e instanceof Error ? e.message : "channel error" }; }
    const status = toStatus(r.status);
    const history = Array.isArray(row.retry_history) ? row.retry_history : [];
    history.push({ at: new Date().toISOString(), status, error: r.error ?? null, by: actor });
    await db().from("notification_log").update({
      status, error: r.error ?? null, provider_message_id: r.providerMessageId ?? row.provider_message_id,
      attempts: (row.attempts ?? 1) + 1, delivery_ms: Date.now() - t0, last_attempt_at: new Date().toISOString(),
      retry_history: history,
    }).eq("id", logId);
    return { ok: status === "delivered", status, error: r.error };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "retry failed" }; }
}

// ── Read / acknowledge (bell badge) ────────────────────────────────────────────
export async function markRead(groupId: string): Promise<{ ok: boolean }> {
  try { await db().from("notification_log").update({ read_at: new Date().toISOString() }).eq("group_id", groupId).is("read_at", null); return { ok: true }; } catch { return { ok: false }; }
}
export async function markAllRead(): Promise<{ ok: boolean; count: number }> {
  try { const { data } = await db().from("notification_log").update({ read_at: new Date().toISOString() }).is("read_at", null).select("id"); return { ok: true, count: (data ?? []).length }; } catch { return { ok: false, count: 0 }; }
}
export async function acknowledgeCritical(groupId: string, actor: string): Promise<{ ok: boolean }> {
  try { await db().from("notification_log").update({ acknowledged_at: new Date().toISOString(), acknowledged_by: actor, read_at: new Date().toISOString() }).eq("group_id", groupId); return { ok: true }; } catch { return { ok: false }; }
}
export async function getUnreadCount(): Promise<{ unread: number; criticalUnacked: number }> {
  try {
    const [{ data: unread }, { data: crit }] = await Promise.all([
      db().from("notification_log").select("group_id").is("read_at", null).limit(2000),
      db().from("notification_log").select("group_id").eq("severity", "critical").is("acknowledged_at", null).limit(2000),
    ]);
    return { unread: new Set(((unread ?? []) as any[]).map((r) => r.group_id)).size, criticalUnacked: new Set(((crit ?? []) as any[]).map((r) => r.group_id)).size }; // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch { return { unread: 0, criticalUnacked: 0 }; }
}

// ── Retention purge ────────────────────────────────────────────────────────────
/** Delete rows past their retention date (high 2y · operational 180d · debug 30d). */
export async function purgeExpiredNotifications(): Promise<{ purged: number }> {
  try {
    const { data } = await db().from("notification_log").delete().lt("expires_at", new Date().toISOString()).select("id");
    return { purged: (data ?? []).length };
  } catch { return { purged: 0 }; }
}

// ── Feed + stats (Operations Center) ───────────────────────────────────────────
export interface FeedChannel { id: string; channel: string; status: DeliveryStatus; target: string | null; error: string | null; attempts: number; deliveryMs: number | null; lastAttemptAt: string | null; retryHistory: { at: string; status: string; error: string | null; by: string }[] }
export interface FeedItem {
  groupId: string; event: string; category: string; severity: string; title: string | null;
  entityType: string | null; entityRef: string | null; createdAt: string; read: boolean;
  acknowledgedAt: string | null; acknowledgedBy: string | null;
  payload: any; channels: FeedChannel[]; status: DeliveryStatus; // eslint-disable-line @typescript-eslint/no-explicit-any
}
export interface FeedFilters { category?: string; severity?: string; status?: string; q?: string; unread?: boolean; page?: number; pageSize?: number }
export interface FeedPage { items: FeedItem[]; total: number; page: number; pageSize: number }

/** Roll a group's channel rows into one overall status (worst-wins, so failures surface). */
function rollup(channels: FeedChannel[]): DeliveryStatus {
  if (channels.some((c) => c.status === "failed")) return "failed";
  if (channels.some((c) => c.status === "retrying")) return "retrying";
  if (channels.some((c) => c.status === "sending")) return "sending";
  if (channels.some((c) => c.status === "delivered")) return "delivered";
  if (channels.some((c) => c.status === "queued")) return "queued";
  return "skipped";
}

export async function getNotificationFeed(f: FeedFilters = {}): Promise<FeedPage> {
  const page = Math.max(1, f.page ?? 1), pageSize = f.pageSize ?? 25;
  try {
    // 1) Find the matching groups (newest first), so filtering never shows a partial channel set.
    let q = db().from("notification_log").select("group_id,created_at").order("created_at", { ascending: false }).limit(2000);
    if (f.category) q = q.eq("category", f.category);
    if (f.severity) q = q.eq("severity", f.severity);
    if (f.status) q = q.eq("status", f.status);
    if (f.unread) q = q.is("read_at", null);
    if (f.q?.trim()) { const t = f.q.trim(); q = q.or(`title.ilike.%${t}%,entity_ref.ilike.%${t}%,event.ilike.%${t}%`); }
    const { data: matches } = await q;
    const ordered: string[] = [];
    for (const r of ((matches ?? []) as any[])) { if (r.group_id && !ordered.includes(r.group_id)) ordered.push(r.group_id); } // eslint-disable-line @typescript-eslint/no-explicit-any
    const total = ordered.length;
    const slice = ordered.slice((page - 1) * pageSize, page * pageSize);
    if (!slice.length) return { items: [], total, page, pageSize };

    // 2) Fetch ALL channel rows for the page's groups.
    const { data: rows } = await db().from("notification_log").select("*").in("group_id", slice);
    const byGroup = new Map<string, any[]>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const r of ((rows ?? []) as any[])) { if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, []); byGroup.get(r.group_id)!.push(r); } // eslint-disable-line @typescript-eslint/no-explicit-any

    const items: FeedItem[] = slice.map((gid) => {
      const rs = (byGroup.get(gid) ?? []).sort((a, b) => String(a.channel).localeCompare(String(b.channel)));
      const first = rs[0] ?? {};
      const channels: FeedChannel[] = rs.map((r) => ({ id: r.id, channel: r.channel, status: r.status, target: r.target ?? null, error: r.error ?? null, attempts: r.attempts ?? 1, deliveryMs: r.delivery_ms ?? null, lastAttemptAt: r.last_attempt_at ?? null, retryHistory: Array.isArray(r.retry_history) ? r.retry_history : [] }));
      return {
        groupId: gid, event: first.event, category: first.category ?? "system", severity: first.severity ?? "info",
        title: first.title ?? null, entityType: first.entity_type ?? null, entityRef: first.entity_ref ?? null,
        createdAt: first.created_at, read: rs.every((r) => !!r.read_at),
        acknowledgedAt: first.acknowledged_at ?? null, acknowledgedBy: first.acknowledged_by ?? null,
        payload: first.payload, channels, status: rollup(channels),
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items, total, page, pageSize };
  } catch { return { items: [], total: 0, page, pageSize }; }
}

export interface NotificationStats { today: number; criticalToday: number; delivered: number; failed: number; deliveryRate: number | null; avgDeliveryMs: number | null; unread: number; criticalUnacked: number }
/** Health of the notifier itself — today's volume, delivery rate, failures, average latency. */
export async function getNotificationStats(): Promise<NotificationStats> {
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await db().from("notification_log").select("group_id,status,severity,delivery_ms").gte("created_at", start.toISOString()).limit(20000);
    const rows = (data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const delivered = rows.filter((r) => r.status === "delivered").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    const attempted = delivered + failed;
    const lat = rows.map((r) => r.delivery_ms).filter((n) => typeof n === "number" && n >= 0) as number[];
    const { unread, criticalUnacked } = await getUnreadCount();
    return {
      today: new Set(rows.map((r) => r.group_id)).size,
      criticalToday: new Set(rows.filter((r) => r.severity === "critical").map((r) => r.group_id)).size,
      delivered, failed,
      deliveryRate: attempted ? Math.round((delivered / attempted) * 1000) / 10 : null,
      avgDeliveryMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
      unread, criticalUnacked,
    };
  } catch { return { today: 0, criticalToday: 0, delivered: 0, failed: 0, deliveryRate: null, avgDeliveryMs: null, unread: 0, criticalUnacked: 0 }; }
}
