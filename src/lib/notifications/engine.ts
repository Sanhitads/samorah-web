/**
 * Notification Engine (review point 8) — `notify(event, ctx)` is the ONE entry point
 * every business event uses to reach a customer. It resolves the event's subscribed
 * channels, skips unconfigured ones, dispatches through each, and records every
 * real attempt in the idempotent `notifications` log.
 *
 * Business services emit events; they never build an email or call a provider.
 */
import { EVENT_CHANNELS } from "./subscriptions";
import { getChannel } from "./channels";
import { recordNotification } from "@/services/notificationService";
import type { NotificationEvent, NotificationContext, ChannelDispatchResult } from "./types";

export async function notify(
  event: NotificationEvent,
  ctx: NotificationContext,
): Promise<{ results: ChannelDispatchResult[]; anyFailed: boolean }> {
  const results: ChannelDispatchResult[] = [];

  for (const key of EVENT_CHANNELS[event] ?? []) {
    const channel = getChannel(key);
    if (!channel) {
      results.push({ channel: key, status: "skipped", error: "channel not registered" });
      continue;
    }
    if (!channel.configured()) {
      results.push({ channel: key, status: "skipped", error: "channel not configured" });
      continue; // unconfigured = skipped, never a failure
    }

    let res: ChannelDispatchResult;
    try {
      res = await channel.send(event, ctx);
    } catch (e) {
      res = { channel: key, status: "failed", error: e instanceof Error ? e.message : "channel error" };
    }
    results.push(res);

    // Record only real attempts (sent/failed); recording is idempotent and must
    // never break delivery.
    try {
      await recordNotification({
        orderId: ctx.orderId,
        event,
        channel: key,
        recipient: res.recipient ?? "",
        status: res.status,
        providerMessageId: res.providerMessageId,
        error: res.error,
      });
    } catch (e) {
      console.error("recordNotification failed", e);
    }
  }

  return { results, anyFailed: results.some((r) => r.status === "failed") };
}
