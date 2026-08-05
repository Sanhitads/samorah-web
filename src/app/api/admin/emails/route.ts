import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import {
  EMAIL_TEMPLATE_DEFS, validateEmailTemplate, renderTemplateContent,
  getEmailTemplateAdmin, saveEmailTemplateDraft, publishEmailTemplate, resetEmailTemplate,
  listEmailRevisions, restoreEmailRevision, type EmailContent,
} from "@/services/emailTemplateService";
import { sendEmail, emailConfigured } from "@/lib/email";

/**
 * POST /api/admin/emails { action, key, patch?, to?, revisionId? }
 *
 * RBAC (server-enforced — UI hiding is not sufficient):
 *   content.edit    → preview · save-draft · validate · revisions · restore (into draft)
 *   content.publish → publish · send-test · reset-to-default
 *
 * Canonical-system rules: preview + send-test render through the SAME block renderer + token path
 * production uses (`renderTemplateContent`), send-test delivers through the canonical `sendEmail`
 * provider, and it is strictly side-effect-free — it never touches order/shipment/return/notification
 * or customer state, and is addressed only to the operator-supplied test recipient.
 */
export const runtime = "nodejs";

const EDIT_ACTIONS = new Set(["preview", "save-draft", "validate", "revisions", "restore"]);
const PUBLISH_ACTIONS = new Set(["publish", "send-test", "reset"]);

/** A representative sample "details" block so authored templates using {{details}} preview faithfully.
 *  Clearly-sample content — no real order is read for a preview or a test. */
function sampleDetailsHtml(): string {
  return `<tr><td style="padding:8px 40px;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:400 13px/1.6 Georgia,serif;color:#6b6259;">
    <tr><td style="padding:6px 0;border-bottom:1px solid #e7e1d8;">Sample Candle · Amber &amp; Oud</td><td align="right" style="padding:6px 0;border-bottom:1px solid #e7e1d8;">₹1,240</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e7e1d8;">Sample Diffuser · Cedar</td><td align="right" style="padding:6px 0;border-bottom:1px solid #e7e1d8;">₹1,240</td></tr>
    <tr><td style="padding:8px 0;font-weight:bold;color:#2b2622;">Total</td><td align="right" style="padding:8px 0;font-weight:bold;color:#2b2622;">₹2,480</td></tr>
  </table><div style="margin-top:6px;font:italic 12px Georgia,serif;color:#9a9086;">[ sample details — the live email injects the real order/tracking/RMA here ]</div></td></tr>`;
}

export async function POST(request: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = String(body.action ?? "");
  const key = String(body.key ?? "");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const def = EMAIL_TEMPLATE_DEFS.find((d) => d.key === key);
  if (!def) return NextResponse.json({ error: "unknown template" }, { status: 404 });

  // ── Server-enforced capability split ──────────────────────────────────────────────────────────────
  const needed = PUBLISH_ACTIONS.has(action) ? "content.publish" : "content.edit";
  const staff = await requireCapability(needed);
  if (!staff.ok) return NextResponse.json({ error: `Forbidden — ${needed} required.` }, { status: 403 });
  if (!EDIT_ACTIONS.has(action) && !PUBLISH_ACTIONS.has(action)) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const actor = staff.userId ?? undefined;

  // Merge an incoming patch over the current draft to evaluate a full content snapshot.
  async function contentFromPatch(): Promise<EmailContent> {
    const admin = await getEmailTemplateAdmin(key);
    const base = admin?.draft ?? { subject: def!.defaultSubject, preheader: "", intro: "", signoff: "", eyebrow: "", heading: "", blocks: [], enabled: true };
    const p = body.patch ?? {};
    return { ...base, ...p, blocks: Array.isArray(p.blocks) ? p.blocks : base.blocks };
  }

  switch (action) {
    case "validate": {
      const c = await contentFromPatch();
      return NextResponse.json({ ok: true, ...validateEmailTemplate(def, c) });
    }
    case "preview": {
      const c = await contentFromPatch();
      const { subject, html, authored } = renderTemplateContent(def, c, def.sample, sampleDetailsHtml());
      return NextResponse.json({ ok: true, subject, html, authored, ...validateEmailTemplate(def, c) });
    }
    case "save-draft": {
      const res = await saveEmailTemplateDraft(key, body.patch ?? {}, actor);
      if (!res.ok) return NextResponse.json({ error: res.reason ?? "save failed" }, { status: 400 });
      const c = await contentFromPatch();
      return NextResponse.json({ ok: true, ...validateEmailTemplate(def, c) });
    }
    case "publish": {
      const res = await publishEmailTemplate(key, actor);
      if (!res.ok) return NextResponse.json({ error: res.reason ?? "publish failed", errors: res.errors }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "reset": {
      const res = await resetEmailTemplate(key, actor);
      if (!res.ok) return NextResponse.json({ error: res.reason ?? "reset failed" }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "revisions": {
      return NextResponse.json({ ok: true, revisions: await listEmailRevisions(key) });
    }
    case "restore": {
      if (!body.revisionId) return NextResponse.json({ error: "revisionId required" }, { status: 400 });
      const res = await restoreEmailRevision(key, String(body.revisionId), actor);
      if (!res.ok) return NextResponse.json({ error: res.reason ?? "restore failed" }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "send-test": {
      const to = String(body.to ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "A valid test recipient is required." }, { status: 400 });
      if (!emailConfigured()) return NextResponse.json({ error: "Email provider is not configured." }, { status: 400 });
      // Test renders the operator's CURRENT editor content (merged over the saved draft) — identical
      // to Preview, so "what you preview is what you test". Strictly side-effect-free: no save, and the
      // published version customers receive is never touched.
      const c = await contentFromPatch();
      const { subject, html, text } = renderTemplateContent(def, c, def.sample, sampleDetailsHtml());
      const r = await sendEmail({ to, subject: `[TEST] ${subject}`, html, text });
      return r.sent
        ? NextResponse.json({ ok: true, to })
        : NextResponse.json({ error: r.reason ?? "send failed" }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
