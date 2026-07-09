/**
 * Event → channel subscriptions. Which channels each event fans out to. Adding
 * WhatsApp to dispatch notifications later is a one-line change here — no service
 * or route edits. (Per-customer channel preferences can layer on top of this map.)
 */
import type { NotificationEvent, ChannelKey } from "./types";

export const EVENT_CHANNELS: Record<NotificationEvent, ChannelKey[]> = {
  "order.confirmed": ["email"],
  "order.dispatched": ["email"],
  "order.cancelled": ["email"],
};
