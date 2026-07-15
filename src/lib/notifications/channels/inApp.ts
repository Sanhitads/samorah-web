/**
 * In-app channel — the always-on dashboard feed. The engine records every dispatch to
 * `notification_log`; an in-app "send" simply marks that this event belongs in the staff feed
 * (the log row IS the in-app notification, read by /admin/notifications-log). Always configured.
 */
import type { OpsEvent, OpsSeverity } from "@/config/notifications";
import type { OpsChannel, OpsPayload, OpsDispatchResult } from "../opsTypes";

export const inAppChannel: OpsChannel = {
  key: "in_app",
  configured: () => true,
  async send(_event: OpsEvent, _payload: OpsPayload, _severity: OpsSeverity): Promise<OpsDispatchResult> {
    return { channel: "in_app", status: "sent", target: "dashboard" };
  },
};
