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
    let sent = 0; let lastErr: string | undefined;
    for (const addr of to) { const r = await sendEmail({ to: addr, subject, html, text: payload.title }); if (r.sent) sent++; else lastErr = r.reason; }
    return sent > 0 ? { channel: "email", status: "sent", target: to.join(",") } : { channel: "email", status: "failed", target: to.join(","), error: lastErr ?? "send failed" };
  },
};
