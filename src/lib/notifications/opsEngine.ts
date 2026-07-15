/**
 * Operational Notification Engine — `notifyOps(event, payload)` is the ONE entry point every
 * operational business event uses to reach staff. It resolves the event's route (which channels,
 * which Slack channel, what severity), skips unconfigured channels, dispatches through each, and
 * records every attempt in `notification_log`. Deterministic + explainable.
 *
 *   Database event → notifyOps(event, payload)
 *                       ├── In-app  (always)
 *                       ├── Email   (summaries/critical)
 *                       ├── Slack   (operational)
 *                       ├── SMS     (critical only)
 *                       ├── WhatsApp (future — dormant)
 *                       └── Push     (future — dormant)
 *
 * The customer-transactional `notify()` engine is untouched; this is a sibling that shares the
 * channel philosophy for staff alerting.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { OPS_ROUTES, type OpsEvent, type OpsChannelKey } from "@/config/notifications";
import type { OpsChannel, OpsPayload, OpsDispatchResult } from "./opsTypes";
import { inAppChannel } from "./channels/inApp";
import { opsEmailChannel } from "./channels/opsEmail";
import { slackChannel } from "./channels/slack";
import { smsChannel } from "./channels/sms";
import { whatsappChannel } from "./channels/whatsapp";
import { pushChannel } from "./channels/push";

/** Channel registry — register a new channel by adding it here (see WhatsApp/Push stubs). */
const OPS_CHANNELS: Record<OpsChannelKey, OpsChannel> = {
  in_app: inAppChannel,
  email: opsEmailChannel,
  slack: slackChannel,
  sms: smsChannel,
  whatsapp: whatsappChannel,
  push: pushChannel,
};

/** Which channels are live (have credentials) vs dormant — for the ops config view. */
export function channelStatus(): { key: OpsChannelKey; configured: boolean }[] {
  return (Object.keys(OPS_CHANNELS) as OpsChannelKey[]).map((key) => ({ key, configured: OPS_CHANNELS[key].configured() }));
}

async function recordOps(event: OpsEvent, payload: OpsPayload, severity: string, r: OpsDispatchResult): Promise<void> {
  try {
    const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    await db.from("notification_log").insert({
      event, channel: r.channel, severity, target: r.target ?? null, title: payload.title,
      status: r.status, provider_message_id: r.providerMessageId ?? null, error: r.error ?? null,
      payload: { message: payload.message ?? null, fields: payload.fields ?? [], url: payload.url ?? null },
      entity_type: payload.entityType ?? null, entity_ref: payload.entityRef ?? null,
    });
  } catch (e) { console.error("recordOps failed", e); }
}

export interface NotifyOpsResult { results: OpsDispatchResult[]; anyFailed: boolean }

/** Fan a business event out to its configured channels. `opts.channels` overrides the route (used
 *  by incident escalation, which derives channels from the escalation policy level). */
export async function notifyOps(event: OpsEvent, payload: OpsPayload, opts?: { channels?: OpsChannelKey[] }): Promise<NotifyOpsResult> {
  const route = OPS_ROUTES[event];
  const channels = opts?.channels ?? route?.channels ?? ["in_app"];
  const severity = payload.severity ?? route?.severity ?? "info";
  const results: OpsDispatchResult[] = [];

  for (const key of channels) {
    const channel = OPS_CHANNELS[key];
    if (!channel) { results.push({ channel: key, status: "skipped", error: "channel not registered" }); continue; }
    if (!channel.configured()) { const r: OpsDispatchResult = { channel: key, status: "skipped", error: "channel not configured" }; results.push(r); await recordOps(event, payload, severity, r); continue; }
    let r: OpsDispatchResult;
    try { r = await channel.send(event, payload, severity); }
    catch (e) { r = { channel: key, status: "failed", error: e instanceof Error ? e.message : "channel error" }; }
    results.push(r);
    await recordOps(event, payload, severity, r);
  }
  return { results, anyFailed: results.some((r) => r.status === "failed") };
}

// ── Log queries (for the in-app feed viewer) ────────────────────────────────────
export interface NotificationLogRow { id: string; event: string; channel: string; severity: string; target: string | null; title: string | null; status: string; error: string | null; entityRef: string | null; createdAt: string; payload: any } // eslint-disable-line @typescript-eslint/no-explicit-any
export async function getNotificationLog(opts: { channel?: string; severity?: string; limit?: number } = {}): Promise<NotificationLogRow[]> {
  try {
    const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let q = db.from("notification_log").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 100);
    if (opts.channel) q = q.eq("channel", opts.channel);
    if (opts.severity) q = q.eq("severity", opts.severity);
    const { data } = await q;
    return ((data ?? []) as any[]).map((r) => ({ id: r.id, event: r.event, channel: r.channel, severity: r.severity, target: r.target ?? null, title: r.title ?? null, status: r.status, error: r.error ?? null, entityRef: r.entity_ref ?? null, createdAt: r.created_at, payload: r.payload })); // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch { return []; }
}
