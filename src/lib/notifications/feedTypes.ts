/**
 * Client-safe feed types + pure view logic. Deliberately separate from `opsEngine`, which is
 * SERVER-ONLY (it imports node:crypto and the service-role Supabase client). The Operations Center
 * is a client component, so it must import from here — never from the engine — or the admin client
 * would be pulled into the browser bundle.
 */
import type { DeliveryStatus } from "@/config/notifications";

export interface RetryEntry { at: string; status: string; error: string | null; by: string }
export interface FeedChannel {
  id: string; channel: string; status: DeliveryStatus; target: string | null; error: string | null;
  attempts: number; deliveryMs: number | null; lastAttemptAt: string | null; nextRetryAt: string | null;
  deadAt: string | null; deadReason: string | null; replayedAt: string | null; replayedBy: string | null;
  retryHistory: RetryEntry[];
}
/** One correlated event behind a collapsed feed item (drill-down preserved). */
export interface CorrelatedRef { groupId: string; ref: string | null; at: string; status: DeliveryStatus }
export interface FeedItem {
  groupId: string; event: string; category: string; severity: string; title: string | null;
  entityType: string | null; entityRef: string | null; createdAt: string; read: boolean; readAt: string | null;
  acknowledgedAt: string | null; acknowledgedBy: string | null;
  payload: any; channels: FeedChannel[]; status: DeliveryStatus; // eslint-disable-line @typescript-eslint/no-explicit-any
  correlationId: string | null; correlatedCount: number; correlatedRefs: CorrelatedRef[];
}

/** Roll a group's channel rows into one overall status (worst-wins, so failures surface). */
export function rollup(channels: { status: DeliveryStatus }[]): DeliveryStatus {
  const order: DeliveryStatus[] = ["dead", "failed", "retrying", "sending", "delivered", "queued", "skipped"];
  for (const s of order) if (channels.some((c) => c.status === s)) return s;
  return "skipped";
}

// ── Event timeline ─────────────────────────────────────────────────────────────
export interface TimelineEvent { at: string; kind: string; label: string; detail?: string | null }
const VERB: Record<string, string> = { delivered: "sent", failed: "failed", skipped: "skipped", sending: "sending", retrying: "retrying", dead: "moved to DLQ", queued: "queued" };

/** PURE — assemble the chronological story of a notification from data we already store:
 *  creation → per-channel dispatches → retries → replay → DLQ → read → acknowledged. */
export function buildTimeline(item: FeedItem): TimelineEvent[] {
  const ev: TimelineEvent[] = [{ at: item.createdAt, kind: "created", label: "Created", detail: item.event }];
  for (const c of item.channels) {
    if (c.lastAttemptAt) {
      // A dead channel's LAST ATTEMPT is a failure; the DLQ hand-off below is its own step, so
      // don't render both as "dead".
      const kind = c.status === "dead" ? "failed" : c.status;
      ev.push({ at: c.lastAttemptAt, kind, label: `${c.channel} ${VERB[kind] ?? kind}`, detail: c.error ?? c.target ?? null });
    }
    for (const h of c.retryHistory) ev.push({ at: h.at, kind: "retry", label: `${c.channel} retry — ${VERB[h.status] ?? h.status}`, detail: h.error ?? `by ${h.by}` });
    if (c.replayedAt) ev.push({ at: c.replayedAt, kind: "replay", label: `${c.channel} replayed from DLQ`, detail: c.replayedBy });
    if (c.deadAt) ev.push({ at: c.deadAt, kind: "dead", label: `${c.channel} moved to Dead Letter Queue`, detail: c.deadReason });
  }
  if (item.readAt) ev.push({ at: item.readAt, kind: "read", label: "Read" });
  if (item.acknowledgedAt) ev.push({ at: item.acknowledgedAt, kind: "acknowledged", label: "Acknowledged", detail: item.acknowledgedBy });
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}
