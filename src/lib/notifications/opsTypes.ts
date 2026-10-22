/**
 * Operational (staff-facing) notification types. A sibling of the customer-transactional
 * `NotificationChannel` — same philosophy (a channel owns its rendering + delivery), different
 * audience and payload. The engine emits an EVENT + a generic payload; each channel renders it.
 */
import type { OpsEvent, OpsChannelKey, OpsSeverity, SlackChannelKey } from "@/config/notifications";

export interface OpsField { label: string; value: string; short?: boolean }

/** Everything a channel needs to render an operational alert. Built by the emitting service. */
export interface OpsPayload {
  title: string;                 // "New Order", "Payment Failure", "Stock Running Low"
  message?: string;              // optional free-text line
  fields?: OpsField[];           // label/value rows (Order #, Customer, Amount, …)
  severity?: OpsSeverity;        // defaults to the route's severity
  url?: string;                  // "View →" deep link
  slackChannel?: SlackChannelKey; // override the route's Slack channel
  entityType?: string;           // order | incident | inventory | shipment …
  entityRef?: string;            // order number / incident number / sku
  emailTo?: string[];            // operational email recipients (defaults to admins)
  smsTo?: string[];              // SMS recipients (defaults to configured alert numbers)
  whatsappTo?: string[];         // WhatsApp recipients (future; defaults to configured numbers)
  idempotencyKey?: string;       // stable per-notification key → provider-side de-dup (Resend) across retries
  deliveredRecipients?: string[]; // recipients already delivered on a prior attempt — a retry skips them
}

export interface OpsDispatchResult {
  channel: OpsChannelKey;
  status: "sent" | "failed" | "skipped";
  target?: string;               // where it went (channel key / number / email)
  providerMessageId?: string;
  error?: string;
  // Multi-recipient channels report the FULL set delivered so far (prior + this attempt). A retry
  // skips these, so a partial failure re-sends ONLY the still-failed recipients. `status` is "sent"
  // only when every intended recipient is in this set.
  deliveredRecipients?: string[];
}

export interface OpsChannel {
  key: OpsChannelKey;
  /** True when the channel has credentials. Unconfigured channels are SKIPPED, never failed. */
  configured(): boolean;
  /** Render + deliver the event. May return `skipped` (e.g. SMS below critical severity). */
  send(event: OpsEvent, payload: OpsPayload, severity: OpsSeverity): Promise<OpsDispatchResult>;
}
