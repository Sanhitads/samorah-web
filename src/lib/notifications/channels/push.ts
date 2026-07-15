/**
 * Push channel — STRUCTURE READY, DORMANT. Web/mobile push for staff (e.g. Web Push / FCM).
 * Plug-and-play: implement the transport + set env, the registry already lists it.
 *
 *   PUSH_PROVIDER / PUSH_KEY … (to be defined when a push provider is chosen)
 */
import type { OpsEvent, OpsSeverity } from "@/config/notifications";
import type { OpsChannel, OpsPayload, OpsDispatchResult } from "../opsTypes";

export const pushChannel: OpsChannel = {
  key: "push",
  configured: () => false, // no provider wired yet
  async send(_event: OpsEvent, _payload: OpsPayload, _severity: OpsSeverity): Promise<OpsDispatchResult> {
    return { channel: "push", status: "skipped", error: "push not configured" };
  },
};
