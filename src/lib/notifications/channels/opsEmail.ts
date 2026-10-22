/**
 * Operational email channel — staff-facing alerts/reports (distinct from the customer
 * transactional email templates in ./email). Renders the generic OpsPayload to a simple HTML
 * block and sends via the existing email provider. Recipients default to admins/managers.
 */
import { emailConfigured, sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEVERITY_EMOJI, type OpsEvent, type OpsSeverity } from "@/config/notifications";
import type { OpsChannel, OpsPayload, OpsDispatchResult } from "../opsTypes";

async function adminEmails(): Promise<string[]> {
  try {
    const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data } = await db.from("users").select("email").in("role", ["manager", "admin", "super_admin"]);
    return ((data ?? []) as any[]).map((u) => u.email).filter(Boolean); // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch { return []; }
}

/** Build the operational email HTML (deterministic; unit-testable). */
export function buildOpsEmailHtml(payload: OpsPayload, severity: OpsSeverity): string {
  const rows = (payload.fields ?? []).map((f) => `<tr><td style="padding:4px 12px 4px 0;color:#6b6259">${f.label}</td><td style="padding:4px 0"><b>${f.value}</b></td></tr>`).join("");
  return `<div style="font-family:sans-serif;max-width:560px">
    <p style="font-size:16px"><b>${SEVERITY_EMOJI[severity]} ${payload.title}</b></p>
    ${payload.message ? `<p>${payload.message}</p>` : ""}
    ${rows ? `<table style="font-size:14px;border-collapse:collapse">${rows}</table>` : ""}
    ${payload.url ? `<p style="margin-top:14px"><a href="${payload.url}">View →</a></p>` : ""}
    <p style="color:#9a8f82;font-size:12px;margin-top:16px">Samorah operations · ${payload.entityRef ?? ""}</p>
  </div>`;
}

export const opsEmailChannel: OpsChannel = {
  key: "email",
  configured: () => emailConfigured(),
  async send(_event: OpsEvent, payload: OpsPayload, severity: OpsSeverity): Promise<OpsDispatchResult> {
    const to = payload.emailTo?.length ? payload.emailTo : await adminEmails();
    if (!to.length) return { channel: "email", status: "skipped", error: "no recipients" };
    const subject = `[Samorah${severity === "critical" ? " · CRITICAL" : ""}] ${payload.title}`;
    const html = buildOpsEmailHtml(payload, severity);
    // Recipients already delivered on a prior attempt are SKIPPED — a retry re-sends only the ones that
    // still failed, so a success is never re-sent (the per-recipient idempotency key is a second line of
    // defence). `status` is "sent" only when EVERY intended recipient has been delivered.
    const delivered = new Set((payload.deliveredRecipients ?? []).filter((a) => to.includes(a)));
    let lastErr: string | undefined;
    for (const addr of to) {
      if (delivered.has(addr)) continue; // already delivered on an earlier attempt
      const idempotencyKey = payload.idempotencyKey ? `${payload.idempotencyKey}:${addr}` : undefined;
      const r = await sendEmail({ to: addr, subject, html, text: payload.title, idempotencyKey });
      if (r.sent) delivered.add(addr); else lastErr = r.reason;
    }
    const all = to.every((a) => delivered.has(a));
    return all
      ? { channel: "email", status: "sent", target: to.join(","), deliveredRecipients: [...delivered] }
      : { channel: "email", status: "failed", target: to.join(","), error: lastErr ?? "send failed", deliveredRecipients: [...delivered] };
  },
};
