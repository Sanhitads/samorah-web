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
  RETRY_POLICY, backoffFor, CORRELATION, correlationKeyFor,
  DEDUP, dedupKeyFor, RATE_LIMITS, RATE_LIMIT_BYPASS,
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

interface LogCtx { groupId: string; event: OpsEvent; payload: OpsPayload; severity: OpsSeverity; category: NotificationCategory; retentionClass: string; expiresAt: string; correlationId: string | null; correlationKey: string | null; dedupKey: string | null }

/**
 * CORRELATION — repeated failures from one root cause share a correlation_id, so the feed collapses
 * "50 payment failures" into ONE item (drill-down preserved). Deterministic: we reuse the newest
 * correlation with the same derived key inside the window, otherwise start a new one.
 */
async function resolveCorrelation(event: OpsEvent, payload: OpsPayload, nowMs: number): Promise<{ id: string | null; key: string | null }> {
  const key = correlationKeyFor(event, payload.entityType, payload.entityRef);
  if (!key) return { id: null, key: null };
  try {
    const since = new Date(nowMs - CORRELATION.windowMinutes * 60000).toISOString();
    const { data } = await db().from("notification_log").select("correlation_id").eq("correlation_key", key).gte("created_at", since).not("correlation_id", "is", null).order("created_at", { ascending: false }).limit(1);
    const existing = ((data ?? []) as any[])[0]?.correlation_id; // eslint-disable-line @typescript-eslint/no-explicit-any
    return { id: existing ?? randomUUID(), key };
  } catch { return { id: randomUUID(), key }; }
}

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
      correlation_id: c.correlationId, correlation_key: c.correlationKey, dedup_key: c.dedupKey,
    }).select("id").single();
    return data?.id ?? null;
  } catch (e) { console.error("openLog failed", e); return null; }
}

/** Finalise the row with the attempt's terminal status + measured latency. A failure schedules the
 *  first backoff so the retry worker can pick it up (manual retry stays available immediately). */
async function closeLog(logId: string | null, r: OpsDispatchResult, deliveryMs: number | null): Promise<void> {
  if (!logId) return;
  try {
    const status = toStatus(r.status);
    const patch: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      status, target: r.target ?? null, provider_message_id: r.providerMessageId ?? null,
      error: r.error ?? null, delivery_ms: deliveryMs, last_attempt_at: new Date().toISOString(),
    };
    if (status === "failed" && RETRY_POLICY.autoRetryChannels.includes(r.channel)) {
      patch.next_retry_at = new Date(Date.now() + backoffFor(1) * 60000).toISOString();
    }
    await db().from("notification_log").update(patch).eq("id", logId);
  } catch (e) { console.error("closeLog failed", e); }
}

/**
 * DEDUP — find a leader dispatch with the same signature inside the window. If one exists we do NOT
 * dispatch again; we bump its counter and preserve this occurrence in notification_occurrences.
 */
async function resolveDedup(event: OpsEvent, payload: OpsPayload, severity: OpsSeverity, nowMs: number): Promise<{ key: string | null; leaderGroupId: string | null }> {
  const key = dedupKeyFor(event, severity, payload.entityRef);
  if (!key) return { key: null, leaderGroupId: null };
  try {
    const since = new Date(nowMs - DEDUP.windowMinutes * 60000).toISOString();
    const { data } = await db().from("notification_log").select("group_id").eq("dedup_key", key).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
    return { key, leaderGroupId: ((data ?? []) as any[])[0]?.group_id ?? null }; // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch { return { key, leaderGroupId: null }; }
}

/** Record a suppressed repeat: the audit keeps every occurrence, the channels stay quiet. */
async function recordOccurrence(leaderGroupId: string, key: string, event: OpsEvent, payload: OpsPayload, severity: OpsSeverity): Promise<number> {
  const at = new Date().toISOString();
  try {
    await db().from("notification_occurrences").insert({ leader_group_id: leaderGroupId, dedup_key: key, event, severity, entity_type: payload.entityType ?? null, entity_ref: payload.entityRef ?? null, payload: { message: payload.message ?? null, fields: payload.fields ?? [] } });
    // Bump the leader's counter on every row of its fan-out so the feed shows "Repeated xN".
    const { data } = await db().from("notification_log").select("id,occurrence_count").eq("group_id", leaderGroupId);
    const rows = (data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const next = (rows[0]?.occurrence_count ?? 1) + 1;
    for (const r of rows) await db().from("notification_log").update({ occurrence_count: next, last_occurrence_at: at }).eq("id", r.id);
    return next;
  } catch { return 1; }
}

/**
 * RATE LIMITING — is this channel over its cap right now? Critical bypasses. Over the cap we do not
 * drop: the caller queues the dispatch for the retry worker to drain.
 */
/** PURE — the rate-limit verdict given how many dispatches this channel already used in its window.
 *  `used` is supplied by the caller so this stays testable without a DB. */
export function rateLimitDecision(channel: OpsChannelKey, severity: OpsSeverity, used: number, nowMs: number): { limited: boolean; retryAt?: string; reason?: string } {
  const cfg = RATE_LIMITS[channel];
  if (!cfg) return { limited: false };                                   // uncapped (e.g. in_app)
  if (RATE_LIMIT_BYPASS.includes(severity)) return { limited: false };   // an emergency is never throttled
  if (used < cfg.maxPerWindow) return { limited: false };
  return { limited: true, retryAt: new Date(nowMs + cfg.windowMinutes * 60000).toISOString(), reason: `rate limit: ${used}/${cfg.maxPerWindow} per ${cfg.windowMinutes}m — queued, will send when the window clears` };
}

async function rateLimited(channel: OpsChannelKey, severity: OpsSeverity, nowMs: number): Promise<{ limited: boolean; retryAt?: string; reason?: string }> {
  const cfg = RATE_LIMITS[channel];
  if (!cfg || RATE_LIMIT_BYPASS.includes(severity)) return { limited: false };   // skip the query entirely
  try {
    const since = new Date(nowMs - cfg.windowMinutes * 60000).toISOString();
    const { data } = await db().from("notification_log").select("id").eq("channel", channel).in("status", ["delivered", "failed", "sending", "dead"]).gte("created_at", since).limit(cfg.maxPerWindow + 1);
    return rateLimitDecision(channel, severity, (data ?? []).length, nowMs);
  } catch { return { limited: false }; }   // never block a dispatch because the counter failed
}

export interface NotifyOpsResult { results: OpsDispatchResult[]; anyFailed: boolean; groupId: string; suppressed?: boolean; occurrenceCount?: number }

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

  // DEDUP — an identical event already dispatched inside the window? Bump its counter, record the
  // occurrence for audit, and send nothing. This is what stops "Gateway down ×27" flooding Slack.
  const dedup = await resolveDedup(event, payload, severity, Date.now());
  if (dedup.key && dedup.leaderGroupId) {
    const count = await recordOccurrence(dedup.leaderGroupId, dedup.key, event, payload, severity);
    return { results: [], anyFailed: false, groupId: dedup.leaderGroupId, suppressed: true, occurrenceCount: count };
  }

  // Per-user preferences for the (per-user) email channel.
  if (channels.includes("email") && !payload.emailTo?.length) payload = { ...payload, emailTo: await resolveEmailRecipients(event, category) };
  const correlation = await resolveCorrelation(event, payload, Date.now());

  const ctx: LogCtx = { groupId, event, payload, severity, category, retentionClass, expiresAt, correlationId: correlation.id, correlationKey: correlation.key, dedupKey: dedup.key };
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
    // RATE LIMIT — over the cap, queue instead of dispatching. The retry worker drains it, so the
    // notification is DELAYED, never dropped. Critical bypasses (see RATE_LIMIT_BYPASS).
    const rl = await rateLimited(key, severity, Date.now());
    if (rl.limited) {
      const id = await openLog(ctx, key, "queued");
      if (id) await db().from("notification_log").update({ error: rl.reason, next_retry_at: rl.retryAt }).eq("id", id);
      results.push({ channel: key, status: "skipped", error: rl.reason });
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

// ── Retry policy + Dead Letter Queue ───────────────────────────────────────────
/** PURE — what the auto-retry worker should do with a row right now. Exhausting the policy is the
 *  ONLY way into the DLQ, so nothing can silently disappear as a permanent "failed". */
/** The active retry policy, exposed read-only (used by the verification report + docs). */
export const RETRY_POLICY_INFO = { maxAttempts: RETRY_POLICY.maxAttempts, backoffMinutes: RETRY_POLICY.backoffMinutes, autoRetryChannels: RETRY_POLICY.autoRetryChannels };

export type RetryAction = "wait" | "retry" | "dead";
export function retryDecision(row: { status: string; attempts: number; channel: string; nextRetryAt?: string | null; error?: string | null }, nowMs: number): { action: RetryAction; reason?: string } {
  // `queued` = rate-limited, waiting for its window to clear. It is NOT a failure: it has spent no
  // attempts and can never go to the DLQ — it just gets sent once the window opens.
  if (row.status === "queued") {
    if (!RETRY_POLICY.autoRetryChannels.includes(row.channel as OpsChannelKey)) return { action: "wait", reason: "channel is not auto-retried" };
    if (row.nextRetryAt && nowMs < new Date(row.nextRetryAt).getTime()) return { action: "wait", reason: "rate-limit window not elapsed" };
    return { action: "retry" };
  }
  if (row.status !== "failed") return { action: "wait", reason: "not failed" };
  if (!RETRY_POLICY.autoRetryChannels.includes(row.channel as OpsChannelKey)) return { action: "wait", reason: "channel is not auto-retried" };
  if (row.attempts >= RETRY_POLICY.maxAttempts) return { action: "dead", reason: row.error ?? "retry policy exhausted" };
  if (row.nextRetryAt && nowMs < new Date(row.nextRetryAt).getTime()) return { action: "wait", reason: "backoff not elapsed" };
  return { action: "retry" };
}

/** Rebuild the dispatch payload from a stored row (retry/replay send the same content). */
function payloadFromRow(row: any): OpsPayload { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    title: row.title ?? "(no title)", message: row.payload?.message ?? undefined,
    fields: row.payload?.fields ?? [], url: row.payload?.url ?? undefined,
    severity: row.severity, entityType: row.entity_type ?? undefined, entityRef: row.entity_ref ?? undefined,
    emailTo: row.channel === "email" && row.target ? String(row.target).split(",") : undefined,
    smsTo: row.channel === "sms" && row.target ? String(row.target).split(",") : undefined,
  };
}

/** The one attempt path shared by manual retry, the auto-retry worker and DLQ replay. On failure it
 *  either schedules the next backoff or — when the policy is exhausted — moves the row to the DLQ. */
async function attemptDispatch(row: any, actor: string): Promise<{ status: DeliveryStatus; error?: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const channel = OPS_CHANNELS[row.channel as OpsChannelKey];
  if (!channel) return { status: row.status, error: "channel not registered" };
  if (!channel.configured()) return { status: row.status, error: "channel not configured" };

  await db().from("notification_log").update({ status: "retrying" as DeliveryStatus, last_attempt_at: new Date().toISOString() }).eq("id", row.id);
  const t0 = Date.now();
  let r: OpsDispatchResult;
  try { r = await channel.send(row.event as OpsEvent, payloadFromRow(row), row.severity as OpsSeverity); }
  catch (e) { r = { channel: row.channel, status: "failed", error: e instanceof Error ? e.message : "channel error" }; }

  const status = toStatus(r.status);
  const attempts = (row.attempts ?? 1) + 1;
  const history = [...(Array.isArray(row.retry_history) ? row.retry_history : []), { at: new Date().toISOString(), status, error: r.error ?? null, by: actor }];
  const patch: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    status, error: r.error ?? null, provider_message_id: r.providerMessageId ?? row.provider_message_id,
    attempts, delivery_ms: Date.now() - t0, last_attempt_at: new Date().toISOString(),
    retry_history: history, next_retry_at: null,
  };
  if (status === "failed") {
    if (attempts >= RETRY_POLICY.maxAttempts) { patch.status = "dead"; patch.dead_at = new Date().toISOString(); patch.dead_reason = r.error ?? "retry policy exhausted"; }
    else patch.next_retry_at = new Date(Date.now() + backoffFor(attempts) * 60000).toISOString();
  } else if (status === "delivered") { patch.dead_at = null; patch.dead_reason = null; }   // recovered out of the DLQ
  await db().from("notification_log").update(patch).eq("id", row.id);
  return { status: patch.status as DeliveryStatus, error: r.error };
}

/** Manual retry from the drawer (e.g. Slack was briefly down). Appends to retry_history; never
 *  creates a duplicate feed item. */
export async function retryDispatch(logId: string, actor: string): Promise<{ ok: boolean; status?: DeliveryStatus; error?: string }> {
  try {
    const { data: row } = await db().from("notification_log").select("*").eq("id", logId).maybeSingle();
    if (!row) return { ok: false, error: "not found" };
    if (row.status === "delivered") return { ok: false, error: "already delivered" };
    const r = await attemptDispatch(row, actor);
    return { ok: r.status === "delivered", status: r.status, error: r.error };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "retry failed" }; }
}

/** AUTO-RETRY WORKER (cron) — walks due failures with backoff and retires exhausted ones to the DLQ. */
export async function runRetryWorker(limit = 50): Promise<{ retried: number; delivered: number; dead: number }> {
  let retried = 0, delivered = 0, dead = 0;
  try {
    const nowIso = new Date().toISOString();
    // `failed` → backoff retries; `queued` → rate-limited dispatches waiting for their window.
    const { data } = await db().from("notification_log").select("*").in("status", ["failed", "queued"]).not("next_retry_at", "is", null).lte("next_retry_at", nowIso).order("next_retry_at", { ascending: true }).limit(limit);
    for (const row of (data ?? []) as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const d = retryDecision({ status: row.status, attempts: row.attempts ?? 1, channel: row.channel, nextRetryAt: row.next_retry_at, error: row.error }, Date.now());
      if (d.action === "wait") continue;
      if (d.action === "dead") {
        await db().from("notification_log").update({ status: "dead", dead_at: nowIso, dead_reason: d.reason ?? "retry policy exhausted", next_retry_at: null }).eq("id", row.id);
        dead++; continue;
      }
      const r = await attemptDispatch(row, "retry-worker");
      retried++;
      if (r.status === "delivered") delivered++;
      if (r.status === "dead") dead++;
    }
  } catch (e) { console.error("retry worker failed", e); }
  return { retried, delivered, dead };
}

/** DLQ REPLAY — manually re-send a dead letter. One attempt: success revives it, failure returns it
 *  to the DLQ. Audited via replayed_at/replayed_by + retry_history. */
export async function replayDeadLetter(logId: string, actor: string): Promise<{ ok: boolean; status?: DeliveryStatus; error?: string }> {
  try {
    const { data: row } = await db().from("notification_log").select("*").eq("id", logId).maybeSingle();
    if (!row) return { ok: false, error: "not found" };
    if (row.status !== "dead") return { ok: false, error: "not a dead letter" };
    await db().from("notification_log").update({ replayed_at: new Date().toISOString(), replayed_by: actor }).eq("id", logId);
    const r = await attemptDispatch(row, `${actor} (replay)`);
    return { ok: r.status === "delivered", status: r.status, error: r.error };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "replay failed" }; }
}

export async function getDeadLetterCount(): Promise<number> {
  try { const { data } = await db().from("notification_log").select("id").eq("status", "dead").limit(1000); return (data ?? []).length; } catch { return 0; }
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
// Feed types + pure view logic live in ./feedTypes so CLIENT components can import them without
// pulling this SERVER-ONLY module (node:crypto + service-role client) into the browser bundle.
export type { RetryEntry, FeedChannel, CorrelatedRef, FeedItem, TimelineEvent } from "./feedTypes";
export { buildTimeline } from "./feedTypes";
import { rollup, type FeedChannel, type FeedItem, type CorrelatedRef } from "./feedTypes";

export interface FeedFilters { category?: string; severity?: string; status?: string; q?: string; unread?: boolean; dlq?: boolean; cursor?: string | null; limit?: number }
/** Cursor page — keyset on created_at (no offset scans, safe at 50k+ rows). */
export interface FeedPage { items: FeedItem[]; nextCursor: string | null; hasMore: boolean }

/** Roll a group's channel rows into one overall status (worst-wins, so failures surface). */
const mapChannel = (r: any): FeedChannel => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
  id: r.id, channel: r.channel, status: r.status, target: r.target ?? null, error: r.error ?? null,
  attempts: r.attempts ?? 1, deliveryMs: r.delivery_ms ?? null, lastAttemptAt: r.last_attempt_at ?? null,
  nextRetryAt: r.next_retry_at ?? null, deadAt: r.dead_at ?? null, deadReason: r.dead_reason ?? null,
  replayedAt: r.replayed_at ?? null, replayedBy: r.replayed_by ?? null,
  retryHistory: Array.isArray(r.retry_history) ? r.retry_history : [],
});

/**
 * CURSOR-PAGINATED FEED. A feed UNIT is `correlation_id ?? group_id`, so repeated failures from one
 * root cause collapse into a single item carrying the full affected list.
 *
 * Keyset: we scan newest-first and stop at `limit` units; `nextCursor` is the scan position (the
 * newest row of the last emitted unit), so the next page continues strictly before it — no offsets,
 * no unbounded loads, and no dropped items. (A correlation whose events straddle a page boundary can
 * surface on both pages; it always shows its true total, so this is cosmetic, never data loss.)
 */
export async function getNotificationFeed(f: FeedFilters = {}): Promise<FeedPage> {
  const limit = Math.min(Math.max(f.limit ?? 25, 1), 100);
  try {
    // 1) Scan for the page's units, newest-first.
    let q = db().from("notification_log").select("group_id,correlation_id,created_at").order("created_at", { ascending: false }).limit(Math.min(limit * 12, 600));
    if (f.cursor) q = q.lt("created_at", f.cursor);
    if (f.dlq) q = q.eq("status", "dead");
    else if (f.status) q = q.eq("status", f.status);
    if (f.category) q = q.eq("category", f.category);
    if (f.severity) q = q.eq("severity", f.severity);
    if (f.unread) q = q.is("read_at", null);
    if (f.q?.trim()) { const t = f.q.trim(); q = q.or(`title.ilike.%${t}%,entity_ref.ilike.%${t}%,event.ilike.%${t}%`); }
    const { data: scan } = await q;

    const unitOrder: string[] = [];
    const unitCursor = new Map<string, string>();   // unit → scan position (its newest created_at)
    const unitIsCorr = new Map<string, boolean>();
    for (const r of ((scan ?? []) as any[])) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const key = r.correlation_id ?? r.group_id;
      if (!key) continue;
      if (!unitCursor.has(key)) { unitOrder.push(key); unitCursor.set(key, r.created_at); unitIsCorr.set(key, !!r.correlation_id); }
    }
    const hasMore = unitOrder.length > limit;
    const page = unitOrder.slice(0, limit);
    if (!page.length) return { items: [], nextCursor: null, hasMore: false };

    // 2) Fetch every row for the page's units (correlations pull in ALL their events).
    const corrIds = page.filter((k) => unitIsCorr.get(k));
    const groupIds = page.filter((k) => !unitIsCorr.get(k));
    const [byCorr, byGroup] = await Promise.all([
      corrIds.length ? db().from("notification_log").select("*").in("correlation_id", corrIds).limit(5000) : Promise.resolve({ data: [] }),
      groupIds.length ? db().from("notification_log").select("*").in("group_id", groupIds).limit(2000) : Promise.resolve({ data: [] }),
    ]);
    const rows = [...((byCorr.data ?? []) as any[]), ...((byGroup.data ?? []) as any[])]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const unitRows = new Map<string, any[]>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const r of rows) { const k = r.correlation_id ?? r.group_id; if (!unitRows.has(k)) unitRows.set(k, []); unitRows.get(k)!.push(r); }

    const items: FeedItem[] = page.map((key) => buildUnitItem(key, unitRows.get(key) ?? [], !!unitIsCorr.get(key)));

    const lastKey = page[page.length - 1];
    return { items, nextCursor: hasMore ? (unitCursor.get(lastKey) ?? null) : null, hasMore };
  } catch { return { items: [], nextCursor: null, hasMore: false }; }
}

/** Build ONE feed item from a unit's rows (a unit = a correlation, or a single group). Shared by the
 *  feed and the single-item refresh, so the drawer and the list can never disagree. */
function buildUnitItem(key: string, rs: any[], isCorr: boolean, preferGroupId?: string): FeedItem { // eslint-disable-line @typescript-eslint/no-explicit-any
  // Group the unit's rows by group_id → each group is one underlying event.
  const groups = new Map<string, any[]>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const r of rs) { if (!groups.has(r.group_id)) groups.set(r.group_id, []); groups.get(r.group_id)!.push(r); }
  const groupList = [...groups.entries()]
    .map(([gid, grs]) => ({ gid, grs, at: grs.map((x) => x.created_at).sort()[0] as string }))
    .sort((a, b) => b.at.localeCompare(a.at));   // newest event first
  const shown = (preferGroupId ? groupList.find((g) => g.gid === preferGroupId) : null) ?? groupList[0];
  const chRows = (shown?.grs ?? []).slice().sort((a, b) => String(a.channel).localeCompare(String(b.channel)));
  const first = chRows[0] ?? {};
  const channels = chRows.map(mapChannel);
  return {
    groupId: shown?.gid ?? key, event: first.event, category: first.category ?? "system", severity: first.severity ?? "info",
    title: first.title ?? null, entityType: first.entity_type ?? null, entityRef: first.entity_ref ?? null,
    createdAt: shown?.at ?? first.created_at, read: chRows.every((r) => !!r.read_at),
    readAt: chRows.map((r) => r.read_at).filter(Boolean).sort()[0] ?? null,
    acknowledgedAt: first.acknowledged_at ?? null, acknowledgedBy: first.acknowledged_by ?? null,
    payload: first.payload, channels, status: rollup(channels),
    occurrenceCount: first.occurrence_count ?? 1, lastOccurrenceAt: first.last_occurrence_at ?? null,
    correlationId: isCorr ? key : null,
    correlatedCount: groupList.length,
    correlatedRefs: groupList.slice(0, 50).map((g) => ({ groupId: g.gid, ref: g.grs[0]?.entity_ref ?? null, at: g.at, status: rollup(g.grs.map((r: any) => ({ status: r.status as DeliveryStatus }))) })), // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

/**
 * Fetch ONE feed item fresh, independent of the current filters. The drawer uses this after a
 * retry/replay/ack: a successful replay stops the row being `dead`, so it drops out of the DLQ view
 * — without this the drawer would keep showing the pre-action snapshot.
 */
export async function getNotificationItem(groupId: string): Promise<FeedItem | null> {
  try {
    const { data: seed } = await db().from("notification_log").select("correlation_id").eq("group_id", groupId).limit(1);
    const corr = ((seed ?? []) as any[])[0]?.correlation_id ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data } = corr
      ? await db().from("notification_log").select("*").eq("correlation_id", corr).limit(5000)
      : await db().from("notification_log").select("*").eq("group_id", groupId).limit(100);
    const rows = (data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!rows.length) return null;
    return buildUnitItem(corr ?? groupId, rows, !!corr, groupId);
  } catch { return null; }
}

// ── Channel health metrics ─────────────────────────────────────────────────────
export type ChannelState = "healthy" | "degraded" | "failing" | "dormant" | "pending";
export interface ChannelHealth {
  key: OpsChannelKey; configured: boolean; state: ChannelState;
  lastSuccessAt: string | null; lastFailureAt: string | null;
  avgLatencyMs24h: number | null; delivered24h: number; failed24h: number; dead: number;
}
/** Per-channel observability: last success, last failure, 24h latency + volumes, current state. */
export async function getChannelHealth(): Promise<ChannelHealth[]> {
  const keys = Object.keys(OPS_CHANNELS) as OpsChannelKey[];
  const since24 = new Date(Date.now() - 86400000).toISOString();
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  let recent: any[] = [], window: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const [a, b] = await Promise.all([
      db().from("notification_log").select("channel,status,created_at").gte("created_at", since30d).in("status", ["delivered", "failed", "dead"]).order("created_at", { ascending: false }).limit(5000),
      db().from("notification_log").select("channel,status,delivery_ms").gte("created_at", since24).limit(5000),
    ]);
    recent = (a.data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    window = (b.data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch { /* fall through to unconfigured/empty metrics */ }

  return keys.map((key) => {
    const configured = OPS_CHANNELS[key].configured();
    const mine = recent.filter((r) => r.channel === key);
    const win = window.filter((r) => r.channel === key);
    const lastSuccessAt = mine.find((r) => r.status === "delivered")?.created_at ?? null;   // recent[] is desc
    const lastFailureAt = mine.find((r) => r.status === "failed" || r.status === "dead")?.created_at ?? null;
    const delivered24h = win.filter((r) => r.status === "delivered").length;
    const failed24h = win.filter((r) => r.status === "failed" || r.status === "dead").length;
    const dead = mine.filter((r) => r.status === "dead").length;
    const lat = win.map((r) => r.delivery_ms).filter((n) => typeof n === "number" && n >= 0) as number[];
    const state: ChannelState = !configured
      ? (key === "whatsapp" ? "pending" : "dormant")
      : failed24h > 0 && delivered24h === 0 ? "failing"
        : failed24h > 0 ? "degraded" : "healthy";
    return { key, configured, state, lastSuccessAt, lastFailureAt, avgLatencyMs24h: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null, delivered24h, failed24h, dead };
  });
}
// ── Analytics (Notification Analytics page) ────────────────────────────────────
/** PURE — nearest-rank percentile (p50/p95 latency). */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}
/** PURE — collapse a provider error into a groupable reason (so "top failure reasons" is useful
 *  rather than a list of unique JSON blobs). Deterministic. */
export function failureReasonKey(error: string | null | undefined): string {
  if (!error?.trim()) return "unknown";
  const e = error.replace(/\s+/g, " ").trim();
  const m = e.match(/^([A-Za-z][\w.-]*)\s+(\d{3})/);        // "resend 422 …", "HTTP 500 …"
  if (m) return `${m[1]} ${m[2]}`;
  const j = e.match(/"name"\s*:\s*"([^"]+)"/);               // provider error names
  if (j) return j[1];
  return e.slice(0, 60);
}
const meanOf = (v: number[]): number | null => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
const minsBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

export interface ChannelAnalytics { channel: string; total: number; delivered: number; failed: number; dead: number; deliveryRate: number | null; avgMs: number | null; p50Ms: number | null; p95Ms: number | null; lastSuccessAt: string | null; uptime7: number | null; uptime30: number | null; uptime90: number | null }
export interface NotificationAnalytics {
  windowDays: number; includeTests: boolean;
  events: number; dispatches: number;
  delivered: number; failed: number; dead: number; skipped: number; deliveryRate: number | null;
  mttaMin: number | null; mttrMin: number | null; timeToReadMin: number | null;
  criticalTotal: number; criticalAcked: number;
  byChannel: ChannelAnalytics[];
  topEvents: { key: string; count: number; failed: number }[];
  topFailures: { key: string; count: number }[];
  daily: { day: string; total: number; delivered: number; failed: number; retries: number }[];
  // Phase 16 additions
  retries: number; queued: number; suppressed: number;
  replayAttempts: number; replaySucceeded: number; replaySuccessRate: number | null;
  hourly: { hour: number; count: number }[];                              // 0–23 distribution
  topNoisy: { key: string; occurrences: number; event: string; entityRef: string | null }[];
  byCategory: { category: string; total: number; failed: number; failureRate: number | null }[];
}

/**
 * Notification analytics — how the NOTIFIER itself is performing. Every number is derived from
 * notification_log rows in the window; nothing is estimated.
 *   MTTA = acknowledged_at − created_at (critical alerts: how fast someone owned it)
 *   MTTR = last_attempt_at − created_at for dispatches that recovered (delivered after ≥1 retry)
 * Test-preset notifications are excluded by default so they can't flatter delivery stats.
 */
export async function getNotificationAnalytics(windowDays = 30, includeTests = false): Promise<NotificationAnalytics> {
  const empty: NotificationAnalytics = { windowDays, includeTests, events: 0, dispatches: 0, delivered: 0, failed: 0, dead: 0, skipped: 0, deliveryRate: null, mttaMin: null, mttrMin: null, timeToReadMin: null, criticalTotal: 0, criticalAcked: 0, byChannel: [], topEvents: [], topFailures: [], daily: [], retries: 0, queued: 0, suppressed: 0, replayAttempts: 0, replaySucceeded: 0, replaySuccessRate: null, hourly: [], topNoisy: [], byCategory: [] };
  try {
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();
    let q = db().from("notification_log").select("group_id,event,channel,status,severity,category,delivery_ms,error,created_at,read_at,acknowledged_at,last_attempt_at,attempts,entity_type,entity_ref,retry_history,occurrence_count,replayed_at,dedup_key").gte("created_at", since).limit(20000);
    if (!includeTests) q = q.or("entity_type.is.null,entity_type.neq.test");
    const { data } = await q;
    const rows = (data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!rows.length) return empty;

    const delivered = rows.filter((r) => r.status === "delivered");
    const failed = rows.filter((r) => r.status === "failed");
    const dead = rows.filter((r) => r.status === "dead");
    const skipped = rows.filter((r) => r.status === "skipped");
    const attempted = delivered.length + failed.length + dead.length;

    // Per-channel, incl. latency distribution (the "Slack/Email/SMS latency" ask).
    /** Uptime = delivery success rate over the trailing N days (skipped/queued excluded — a dormant
     *  or throttled channel is not "down"). Null when the channel had no attempts in the period. */
    const uptimeFor = (ch: string, days: number): number | null => {
      const from = Date.now() - days * 86400000;
      const m = rows.filter((r) => r.channel === ch && new Date(r.created_at).getTime() >= from && ["delivered", "failed", "dead"].includes(r.status));
      if (!m.length) return null;
      return Math.round((m.filter((r) => r.status === "delivered").length / m.length) * 1000) / 10;
    };

    const channels = [...new Set(rows.map((r) => r.channel))].sort();
    const byChannel: ChannelAnalytics[] = channels.map((ch) => {
      const mine = rows.filter((r) => r.channel === ch);
      const d = mine.filter((r) => r.status === "delivered");
      const f = mine.filter((r) => r.status === "failed").length;
      const dd = mine.filter((r) => r.status === "dead").length;
      const lat = mine.map((r) => r.delivery_ms).filter((n) => typeof n === "number" && n >= 0) as number[];
      const att = d.length + f + dd;
      return {
        channel: ch, total: mine.length, delivered: d.length, failed: f, dead: dd,
        deliveryRate: att ? Math.round((d.length / att) * 1000) / 10 : null,
        avgMs: meanOf(lat), p50Ms: percentile(lat, 50), p95Ms: percentile(lat, 95),
        lastSuccessAt: d.map((r) => r.created_at).sort().reverse()[0] ?? null,
        uptime7: uptimeFor(ch, Math.min(7, windowDays)), uptime30: uptimeFor(ch, Math.min(30, windowDays)), uptime90: uptimeFor(ch, Math.min(90, windowDays)),
      };
    });

    // Top notification types + top failure reasons.
    const evMap = new Map<string, { count: number; failed: number }>();
    for (const r of rows) {
      const cur = evMap.get(r.event) ?? { count: 0, failed: 0 };
      cur.count++; if (r.status === "failed" || r.status === "dead") cur.failed++;
      evMap.set(r.event, cur);
    }
    const failMap = new Map<string, number>();
    for (const r of [...failed, ...dead]) { const k = failureReasonKey(r.error); failMap.set(k, (failMap.get(k) ?? 0) + 1); }

    // Daily trend (incl. retries/day) + hourly distribution.
    const dayMap = new Map<string, { total: number; delivered: number; failed: number; retries: number }>();
    const hourMap = new Map<number, number>();
    for (const r of rows) {
      const day = String(r.created_at).slice(0, 10);
      const cur = dayMap.get(day) ?? { total: 0, delivered: 0, failed: 0, retries: 0 };
      cur.total++;
      if (r.status === "delivered") cur.delivered++;
      if (r.status === "failed" || r.status === "dead") cur.failed++;
      cur.retries += Array.isArray(r.retry_history) ? r.retry_history.length : 0;
      dayMap.set(day, cur);
      const h = new Date(r.created_at).getHours();
      hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
    }

    // Retries / replays / queued / suppressed.
    const retries = rows.reduce((s, r) => s + (Array.isArray(r.retry_history) ? r.retry_history.length : 0), 0);
    const replayEntries = rows.flatMap((r) => (Array.isArray(r.retry_history) ? r.retry_history : []).filter((h: any) => typeof h?.by === "string" && h.by.includes("(replay)"))); // eslint-disable-line @typescript-eslint/no-explicit-any
    const replaySucceeded = replayEntries.filter((h: any) => h.status === "delivered").length; // eslint-disable-line @typescript-eslint/no-explicit-any
    const queued = rows.filter((r) => r.status === "queued").length;
    const suppressed = rows.reduce((s, r) => s + Math.max(0, (r.occurrence_count ?? 1) - 1), 0);

    // Noisiest alerts (dedup counters) + failure rate by category.
    const topNoisy = rows.filter((r) => (r.occurrence_count ?? 1) > 1)
      .map((r) => ({ key: r.dedup_key ?? r.event, occurrences: r.occurrence_count as number, event: r.event as string, entityRef: (r.entity_ref ?? null) as string | null }))
      .sort((a, b) => b.occurrences - a.occurrences).slice(0, 8);
    const catMap = new Map<string, { total: number; failed: number }>();
    for (const r of rows) {
      const c = r.category ?? "system";
      const cur = catMap.get(c) ?? { total: 0, failed: 0 };
      cur.total++; if (r.status === "failed" || r.status === "dead") cur.failed++;
      catMap.set(c, cur);
    }

    // Response + recovery times.
    const acked = rows.filter((r) => r.acknowledged_at);
    const readRows = rows.filter((r) => r.read_at);
    const recovered = delivered.filter((r) => (r.attempts ?? 1) > 1 && r.last_attempt_at);
    const crit = rows.filter((r) => r.severity === "critical");

    return {
      windowDays, includeTests,
      events: new Set(rows.map((r) => r.group_id)).size, dispatches: rows.length,
      delivered: delivered.length, failed: failed.length, dead: dead.length, skipped: skipped.length,
      deliveryRate: attempted ? Math.round((delivered.length / attempted) * 1000) / 10 : null,
      mttaMin: meanOf(acked.map((r) => minsBetween(r.created_at, r.acknowledged_at))),
      mttrMin: meanOf(recovered.map((r) => minsBetween(r.created_at, r.last_attempt_at))),
      timeToReadMin: meanOf(readRows.map((r) => minsBetween(r.created_at, r.read_at))),
      criticalTotal: new Set(crit.map((r) => r.group_id)).size,
      criticalAcked: new Set(crit.filter((r) => r.acknowledged_at).map((r) => r.group_id)).size,
      byChannel,
      topEvents: [...evMap.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count).slice(0, 10),
      topFailures: [...failMap.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 8),
      daily: [...dayMap.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
      retries, queued, suppressed,
      replayAttempts: replayEntries.length, replaySucceeded,
      replaySuccessRate: replayEntries.length ? Math.round((replaySucceeded / replayEntries.length) * 1000) / 10 : null,
      hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap.get(h) ?? 0 })),
      topNoisy,
      byCategory: [...catMap.entries()].map(([category, v]) => ({ category, total: v.total, failed: v.failed, failureRate: v.total ? Math.round((v.failed / v.total) * 1000) / 10 : null })).sort((a, b) => b.total - a.total),
    };
  } catch { return empty; }
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
