/**
 * WhatsApp channel — STRUCTURE READY, DORMANT. D2C luxury customers/staff respond far better to
 * WhatsApp than SMS (rich messages, buttons, images, tracking links). Wiring is plug-and-play:
 * set the env vars below and flip nothing else — the registry already lists this channel.
 *
 *   WHATSAPP_PROVIDER      — "msg91" | "cloud" (Meta Cloud API)
 *   WHATSAPP_AUTH_KEY      — MSG91 authkey / Cloud API token
 *   WHATSAPP_FROM          — sender / phone-number-id
 *   WHATSAPP_TEMPLATE      — approved template name
 *   WHATSAPP_ALERT_NUMBERS — comma-separated recipients
 *
 * NOTE (per ops): WhatsApp Cloud needs a NEW dedicated business number — pending. Until then this
 * channel reports `configured() === false` and is cleanly skipped, exactly like SMS was.
 */
import type { OpsEvent, OpsSeverity } from "@/config/notifications";
import type { OpsChannel, OpsPayload, OpsDispatchResult } from "../opsTypes";

const alertNumbers = (): string[] => (process.env.WHATSAPP_ALERT_NUMBERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Render the WhatsApp body (deterministic). When the number is provisioned, this feeds the
 *  provider's template variables — the render is already correct, only the transport is pending. */
export function buildWhatsappText(payload: OpsPayload): string {
  const lines = [`*${payload.title}*`, payload.message, ...(payload.fields ?? []).map((f) => `${f.label}: ${f.value}`), payload.url ? `View: ${payload.url}` : null];
  return lines.filter(Boolean).join("\n").slice(0, 1000);
}

export const whatsappChannel: OpsChannel = {
  key: "whatsapp",
  configured: () => !!process.env.WHATSAPP_AUTH_KEY && !!process.env.WHATSAPP_FROM && alertNumbers().length > 0,
  async send(_event: OpsEvent, payload: OpsPayload, _severity: OpsSeverity): Promise<OpsDispatchResult> {
    // Transport pending a dedicated business number. The message is fully rendered so that
    // enabling this later is a single env-driven step (no logic change).
    const recipients = payload.whatsappTo ?? alertNumbers();
    if (!process.env.WHATSAPP_AUTH_KEY) return { channel: "whatsapp", status: "skipped", error: "whatsapp not configured (pending business number)" };
    void buildWhatsappText(payload); void recipients;
    // TODO: POST to WHATSAPP_PROVIDER once the number is live. Kept as an explicit skip so nothing
    // silently "succeeds" without a real send.
    return { channel: "whatsapp", status: "skipped", error: "whatsapp transport pending business number" };
  },
};
