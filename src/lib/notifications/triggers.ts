/**
 * Notification triggers (§10) — event → channels → template. One place maps a domain
 * event to how customers are told, so every event notifies consistently. Email is
 * implemented today; WhatsApp/SMS/push are declared channels (senders land later).
 */
export type NotificationChannel = "email" | "whatsapp" | "sms" | "push";

export interface NotificationTrigger {
  event: string; // order.confirmed | order.dispatched | order.delivered | ...
  channel: NotificationChannel;
  template: string; // ORDER_CONFIRMATION | ORDER_DISPATCHED | ...
  active: boolean;
}

/** Code-default triggers — used when the DB table is empty. */
export const DEFAULT_NOTIFICATION_TRIGGERS: NotificationTrigger[] = [
  { event: "order.confirmed", channel: "email", template: "ORDER_CONFIRMATION", active: true },
  { event: "order.dispatched", channel: "email", template: "ORDER_DISPATCHED", active: true },
];

/** Channels that actually have a sender wired today. */
export const IMPLEMENTED_CHANNELS: NotificationChannel[] = ["email"];

export function channelsFor(triggers: NotificationTrigger[], event: string): { channel: NotificationChannel; template: string }[] {
  return triggers.filter((t) => t.active && t.event === event).map((t) => ({ channel: t.channel, template: t.template }));
}

export function isChannelImplemented(c: NotificationChannel): boolean {
  return IMPLEMENTED_CHANNELS.includes(c);
}
