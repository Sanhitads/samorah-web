/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Email delivery visibility (Phase 2 · points 11-12) — READ-ONLY operational health + a small
 * per-event delivery log, backed EXCLUSIVELY by the canonical `notification_dispatches` table.
 *
 * Hard architectural boundaries (locked):
 *  - This module NEVER writes. `notification_dispatches` remains delivery-truth; the fulfillment job
 *    queue remains retry-truth. Email CMS is not a second execution/retry engine.
 *  - No new delivery table, no mirroring into notification_log, no send-path change.
 *  - Only fields the canonical dispatch data actually stores are surfaced (status, time, recipient,
 *    error, provider id, and the STORED domain refs order_id / entity_ref). There is NO stored
 *    dispatch→fulfillment-job reference, so none is invented — retry is linked by documentation, not
 *    a fabricated correlation.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export const EMAIL_CHANNEL = "email";
const DAY_MS = 24 * 60 * 60 * 1000;
/** How many recent email dispatch rows we scan for the health summary. Beyond this a template reads as
 *  "idle" (no recent activity) — an operational signal, not a data claim. Volume is low (7 events). */
const HEALTH_SCAN_LIMIT = 500;

export type EmailHealthStatus = "healthy" | "degraded" | "failing" | "idle";
export interface EmailHealth {
  status: EmailHealthStatus;
  lastSentAt: string | null; // most recent successful send (may be older than 24h)
  lastAttemptAt: string | null; // most recent dispatch of any status
  sent24h: number;
  failed24h: number;
  lastError: string | null; // most recent failure's error text, if any in the scan window
}
export interface EmailDispatchRow {
  id: string;
  status: string; // sent | failed | skipped
  recipient: string; // masked for display
  error: string | null;
  providerMessageId: string | null;
  createdAt: string;
  orderId: string | null; // STORED — the FK on the dispatch row
  orderNumber: string | null; // resolved from order_id (stored FK) for the /admin/orders route key
  entityRef: string | null; // STORED — return id for return events ('' → null); deep-links to /admin/returns
}

/** Mask a recipient for admin display: a***@example.com (never render full customer addresses). */
export function maskRecipient(email: string): string {
  const s = String(email ?? "").trim();
  const at = s.indexOf("@");
  if (at <= 0) return s ? "•••" : "";
  const first = s[0];
  return `${first}***${s.slice(at)}`;
}

/**
 * Defense-in-depth: the stored `error` can include a slice of a raw provider response
 * (provider.ts formats it as "resend <status>: <body slice>"). Provider *message ids* are safe to
 * show; secrets are not. Redact anything shaped like a key, bearer token, or auth/secret assignment
 * before it reaches the admin. Provider-response bodies don't carry our API key, but this guarantees
 * a future provider/format change can't leak one through this surface.
 */
export function redactSecrets(text: string | null): string | null {
  if (!text) return text ?? null;
  return String(text)
    .replace(/\b(bearer)\s+[\w.\-]+/gi, "$1 [redacted]")
    .replace(/\b(?:re|sk|rk|pk)_[A-Za-z0-9]{6,}\b/g, "[redacted-key]")
    .replace(/\b(authorization|api[-_]?key|x-api-key|secret|token|password)\b(\s*"?\s*[:=]\s*"?)[^\s"',}]+/gi, "$1$2[redacted]");
}

/** The EXACT set of fields exposed for a delivery row — an explicit allowlist. Raw provider payloads,
 *  credentials, headers or any un-listed column must never appear here. */
export const DELIVERY_ROW_FIELDS = ["id", "status", "recipient", "error", "providerMessageId", "createdAt", "orderId", "orderNumber", "entityRef"] as const;

/** Pure, testable mapper from a raw dispatch row → the safe display row (mask + redact + allowlist). */
export function toDeliveryRow(r: any, orderNumber: string | null): EmailDispatchRow {
  return {
    id: r.id,
    status: r.status,
    recipient: maskRecipient(r.recipient),
    error: redactSecrets(r.error ?? null),
    providerMessageId: r.provider_message_id ?? null,
    createdAt: r.created_at,
    orderId: r.order_id ?? null,
    orderNumber: r.order_id ? orderNumber : null,
    entityRef: r.entity_ref ? String(r.entity_ref) : null,
  };
}

interface RawRow { event: string; status: string; created_at: string; error: string | null }

/** Pure health derivation from a set of recent dispatch rows (newest-first not required). Exported for
 *  unit testing; `nowMs` is injectable so tests are deterministic. */
export function deriveHealth(rows: RawRow[], events: string[], nowMs: number): Record<string, EmailHealth> {
  const cutoff = nowMs - DAY_MS;
  const out: Record<string, EmailHealth> = {};
  for (const e of events) out[e] = { status: "idle", lastSentAt: null, lastAttemptAt: null, sent24h: 0, failed24h: 0, lastError: null };
  // Track the newest failure per event to surface its error.
  const newestFailureAt: Record<string, number> = {};
  for (const r of rows) {
    const h = out[r.event];
    if (!h) continue; // ignore events we don't manage
    const t = Date.parse(r.created_at);
    if (!h.lastAttemptAt || t > Date.parse(h.lastAttemptAt)) h.lastAttemptAt = r.created_at;
    if (r.status === "sent" && (!h.lastSentAt || t > Date.parse(h.lastSentAt))) h.lastSentAt = r.created_at;
    if (t >= cutoff) {
      if (r.status === "sent") h.sent24h++;
      else if (r.status === "failed") h.failed24h++;
    }
    if (r.status === "failed" && (newestFailureAt[r.event] === undefined || t > newestFailureAt[r.event])) {
      newestFailureAt[r.event] = t; h.lastError = r.error ?? null;
    }
  }
  for (const e of events) {
    const h = out[e];
    // failing: a failure in the last 24h AND the most recent attempt failed (unresolved).
    // degraded: some failures in 24h but the latest attempt succeeded (self-recovered / transient).
    // healthy: recent successful activity, no 24h failures. idle: no activity in the scan window.
    if (!h.lastAttemptAt) h.status = "idle";
    else if (h.failed24h > 0 && newestFailureAt[e] !== undefined && Date.parse(h.lastAttemptAt) === newestFailureAt[e]) h.status = "failing";
    else if (h.failed24h > 0) h.status = "degraded";
    else h.status = "healthy";
  }
  return out;
}

/** Per-event operational health across all managed email templates (one indexed scan). Read-only. */
export async function getEmailDeliveryHealth(events: string[]): Promise<Record<string, EmailHealth>> {
  let rows: RawRow[] = [];
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("notification_dispatches")
      .select("event,status,created_at,error")
      .eq("channel", EMAIL_CHANNEL)
      .order("created_at", { ascending: false })
      .limit(HEALTH_SCAN_LIMIT);
    rows = (data ?? []) as RawRow[];
  } catch { /* health is best-effort — never break the admin page */ }
  return deriveHealth(rows, events, Date.now());
}

/** Recent delivery rows for ONE event (email channel), newest first. Read-only; recipients masked. */
export async function listEmailDeliveries(event: string, limit = 50): Promise<EmailDispatchRow[]> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("notification_dispatches")
      .select("id,status,recipient,error,provider_message_id,created_at,order_id,entity_ref")
      .eq("channel", EMAIL_CHANNEL)
      .eq("event", event)
      .order("created_at", { ascending: false })
      .limit(limit);
    const rows = (data ?? []) as any[];
    // Resolve order_id → order_number (a STORED FK) so the row can deep-link to /admin/orders/[orderNumber].
    const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))];
    const numById = new Map<string, string>();
    if (orderIds.length) {
      const { data: orders } = await db.from("orders").select("id,order_number").in("id", orderIds);
      for (const o of (orders ?? []) as any[]) numById.set(o.id, o.order_number);
    }
    return rows.map((r) => toDeliveryRow(r, r.order_id ? (numById.get(r.order_id) ?? null) : null));
  } catch { return []; }
}
