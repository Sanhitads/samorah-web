/**
 * Notification persistence — the idempotent dispatch log behind the engine.
 * `recordNotification` upserts one (order, event, channel, recipient) row so a job
 * retry or duplicate emit never double-counts. `getOrderNotifications` reads the
 * trail for an order (admin timeline / debugging).
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationEvent, ChannelKey } from "@/lib/notifications/types";

export interface RecordNotificationInput {
  orderId?: string;
  event: NotificationEvent;
  channel: ChannelKey;
  recipient: string;
  status: "sent" | "failed" | "skipped";
  providerMessageId?: string;
  error?: string;
}

export async function recordNotification(input: RecordNotificationInput): Promise<void> {
  await callRpc<{ ok: boolean }>("record_notification", {
    p: {
      order_id: input.orderId ?? null,
      event: input.event,
      channel: input.channel,
      recipient: input.recipient,
      status: input.status,
      provider_message_id: input.providerMessageId ?? null,
      error: input.error ?? null,
    },
  });
}

export async function getOrderNotifications(orderId: string): Promise<
  Array<{ event: string; channel: string; recipient: string; status: string; created_at: string }>
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("notification_dispatches")
    .select("event,channel,recipient,status,created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  return data ?? [];
}
