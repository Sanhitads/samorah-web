/**
 * Notification Engine types (review point 8). A business event fans out to N
 * channels; each channel owns its own templates and delivery. Business services
 * emit an EVENT — they never touch a template or a provider SDK.
 *
 * Domain reference: docs/SLP_DOMAIN_MODEL.md §4.
 */
export type NotificationEvent =
  | "order.confirmed"
  | "order.dispatched"
  | "order.cancelled"
  | "return.requested"
  | "return.approved"
  | "return.rejected"
  | "return.refunded";
// Future events (refund.processed, delivery.completed) add here + a template in
// each channel — no new bespoke send path.

export type ChannelKey = "email" | "whatsapp" | "sms" | "push";

/** Minimal context — a channel fetches whatever its template needs. `returnId` is
 *  present for return.* events; it also disambiguates the dispatch-log dedup key. */
export interface NotificationContext {
  orderId: string;
  returnId?: string;
}

export interface ChannelDispatchResult {
  channel: ChannelKey;
  status: "sent" | "failed" | "skipped";
  recipient?: string;
  providerMessageId?: string;
  error?: string;
}

export interface NotificationChannel {
  key: ChannelKey;
  /** True when the channel has credentials. Unconfigured channels are skipped, not failed. */
  configured(): boolean;
  /** Render + deliver this event. Returns `skipped` if the channel has no template for it. */
  send(event: NotificationEvent, ctx: NotificationContext): Promise<ChannelDispatchResult>;
}
