/**
 * SMS channel — MSG91 (India, DLT-compliant transactional). RESERVED FOR CRITICAL EVENTS: the
 * channel refuses anything below `critical` severity, so a mis-configured route can never generate
 * SMS spam. Dormant until the MSG91 env vars are set (plug-and-play).
 *
 *   MSG91_AUTH_KEY        — API auth key
 *   MSG91_SMS_TEMPLATE_ID — approved DLT flow template id
 *   MSG91_SMS_VAR         — the template's variable name for the alert text (default "body")
 *   MSG91_ALERT_NUMBERS   — comma-separated 91-prefixed numbers (fallback recipients)
 */
import type { OpsEvent, OpsSeverity } from "@/config/notifications";
import type { OpsChannel, OpsPayload, OpsDispatchResult } from "../opsTypes";

const AUTH = () => process.env.MSG91_AUTH_KEY;
const TEMPLATE = () => process.env.MSG91_SMS_TEMPLATE_ID;
const alertNumbers = (): string[] => (process.env.MSG91_ALERT_NUMBERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Compact one-line SMS body (deterministic; unit-testable). */
export function buildSmsText(payload: OpsPayload): string {
  const key = payload.fields?.find((f) => /order|incident|sku|ref/i.test(f.label));
  const bits = [payload.title, payload.message, key ? `${key.label}: ${key.value}` : null].filter(Boolean);
  return `${bits.join(". ")}. — Samorah`.replace(/\s+/g, " ").trim().slice(0, 160);
}

export const smsChannel: OpsChannel = {
  key: "sms",
  configured: () => !!AUTH() && !!TEMPLATE() && alertNumbers().length > 0,
  async send(_event: OpsEvent, payload: OpsPayload, severity: OpsSeverity): Promise<OpsDispatchResult> {
    if (severity !== "critical") return { channel: "sms", status: "skipped", error: "SMS is reserved for critical severity" };
    const recipients = payload.smsTo?.length ? payload.smsTo : alertNumbers();
    if (!recipients.length) return { channel: "sms", status: "skipped", error: "no recipients" };
    const varName = process.env.MSG91_SMS_VAR || "body";
    const text = buildSmsText(payload);
    try {
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: AUTH() as string },
        body: JSON.stringify({ template_id: TEMPLATE(), short_url: 0, recipients: recipients.map((m) => ({ mobiles: m, [varName]: text })) }),
      });
      const data = await res.json().catch(() => ({}));
      return res.ok && data?.type !== "error"
        ? { channel: "sms", status: "sent", target: recipients.join(","), providerMessageId: data?.request_id ?? data?.requestId }
        : { channel: "sms", status: "failed", target: recipients.join(","), error: data?.message ?? `HTTP ${res.status}` };
    } catch (e) {
      return { channel: "sms", status: "failed", error: e instanceof Error ? e.message : "sms error" };
    }
  },
};
