/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Email Template service (CMS slice 5) — transactional email copy as content, now a DRAFT→PUBLISH
 * resource (reusing the immutable cms_revisions store, no scheduling).
 *
 * Canonical-system rules (locked):
 *  - The production send path reads ONLY the PUBLISHED version — the existing scalar columns
 *    (subject/preheader/…/blocks/enabled). `getEmailTemplate`/`resolveSubject`/`renderAuthoredEmail`
 *    are unchanged in behaviour; a saved DRAFT never changes what customers receive.
 *  - `draft` (a new jsonb column) holds the in-progress edit. Publish validates it, snapshots the
 *    version to cms_revisions, atomically promotes it into the published scalars, and clears the draft.
 *  - Token resolution is the single canonical module (`@/lib/email/tokens`) — unknown tokens render
 *    BLANK at send (never leak) and are logged as an operational defect via the canonical audit log.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { renderEmailBlocks, type EmailBlock } from "@/lib/email/blocks";
import { interpolate, interpolateTracked, extractTokens, suggestToken } from "@/lib/email/tokens";
import { snapshotRevision, listRevisions as listCmsRevisions, getRevisionSnapshot, type Revision } from "@/services/cms/revisions";

export interface EmailTemplateDef { key: string; label: string; vars: string[]; sample: Record<string, string>; defaultSubject: string; requiresDetails?: boolean }

// `requiresDetails` = a transactional details block (order table / tracking / RMA) must not be dropped:
// if an admin authors a body for these events, publish requires a "details" block.
export const EMAIL_TEMPLATE_DEFS: EmailTemplateDef[] = [
  { key: "order.confirmed", label: "Order confirmation", vars: ["orderNumber", "name", "total"], sample: { orderNumber: "SAM1042", name: "Aarohi", total: "₹2,480" }, defaultSubject: "Your Samorah order {{orderNumber}} is confirmed", requiresDetails: true },
  { key: "order.dispatched", label: "Order dispatched", vars: ["orderNumber", "name", "courier", "awb"], sample: { orderNumber: "SAM1042", name: "Aarohi", courier: "Delhivery", awb: "DL1234567" }, defaultSubject: "Your order {{orderNumber}} is on its way", requiresDetails: true },
  { key: "order.cancelled", label: "Order cancelled", vars: ["orderNumber", "name"], sample: { orderNumber: "SAM1042", name: "Aarohi" }, defaultSubject: "Your Samorah order {{orderNumber}} was cancelled" },
  { key: "delivery.completed", label: "Order delivered", vars: ["orderNumber", "name"], sample: { orderNumber: "SAM1042", name: "Aarohi" }, defaultSubject: "Your Samorah order {{orderNumber}} has arrived" },
  { key: "return.requested", label: "Return requested", vars: ["rmaNumber", "orderNumber"], sample: { rmaNumber: "RMA-88", orderNumber: "SAM1042" }, defaultSubject: "We've received your return request {{rmaNumber}}", requiresDetails: true },
  { key: "return.approved", label: "Return approved", vars: ["rmaNumber", "orderNumber"], sample: { rmaNumber: "RMA-88", orderNumber: "SAM1042" }, defaultSubject: "Your return {{rmaNumber}} is approved", requiresDetails: true },
  { key: "return.refunded", label: "Return refunded", vars: ["rmaNumber", "orderNumber"], sample: { rmaNumber: "RMA-88", orderNumber: "SAM1042" }, defaultSubject: "Your refund for {{rmaNumber}} is on its way", requiresDetails: true },
];

const DEF_BY_KEY = new Map(EMAIL_TEMPLATE_DEFS.map((d) => [d.key, d]));
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/** The editable content of a template (draft OR published). */
export interface EmailContent { subject: string; preheader: string; intro: string; signoff: string; eyebrow: string; heading: string; blocks: EmailBlock[]; enabled: boolean }
/** Send-facing view (the PUBLISHED content merged over the coded default). */
export interface EmailTemplate extends EmailContent { key: string; source: "db" | "default"; def: EmailTemplateDef }
/** Admin view: published + draft + status. */
export interface EmailTemplateAdmin { key: string; def: EmailTemplateDef; published: EmailContent; draft: EmailContent; status: "published" | "draft"; source: "db" | "default" }

const emptyContent = (def: EmailTemplateDef): EmailContent => ({ subject: def.defaultSubject, preheader: "", intro: "", signoff: "", eyebrow: "", heading: "", blocks: [], enabled: true });
/** The PUBLISHED content = the scalar columns merged over the coded default. */
function publishedFromRow(row: any, def: EmailTemplateDef): EmailContent {
  return {
    subject: row?.subject || def.defaultSubject, preheader: row?.preheader ?? "", intro: row?.intro ?? "", signoff: row?.signoff ?? "",
    eyebrow: row?.eyebrow ?? "", heading: row?.heading ?? "", blocks: Array.isArray(row?.blocks) ? row.blocks : [], enabled: row ? row.enabled !== false : true,
  };
}

// ── Validation (canonical tokens; block on publish) ──────────────────────────────────────────────────
export interface TemplateValidation { errors: string[]; warnings: string[] }
export function validateEmailTemplate(def: EmailTemplateDef, c: EmailContent): TemplateValidation {
  const errors: string[] = [], warnings: string[] = [];
  const allowed = new Set([...def.vars, "details"]); // `details` = the transactional injection token
  const texts = [c.subject ?? "", c.preheader ?? "", c.eyebrow ?? "", c.heading ?? ""];
  for (const b of c.blocks ?? []) { if (b.text) texts.push(b.text); if (b.ctaLabel) texts.push(b.ctaLabel); if (b.ctaHref) texts.push(b.ctaHref); }
  const unknown = new Set<string>();
  for (const t of texts) for (const tok of extractTokens(t)) if (!allowed.has(tok)) unknown.add(tok);
  for (const tok of unknown) { const s = suggestToken(tok, [...def.vars]); errors.push(`Unknown variable {{${tok}}}${s ? ` — did you mean {{${s}}}?` : ` (valid: ${def.vars.map((v) => `{{${v}}}`).join(", ")})`}`); }
  if (!(c.subject ?? "").trim()) errors.push("Subject is empty.");
  if ((c.blocks ?? []).length && def.requiresDetails && !c.blocks.some((b) => b.type === "details")) errors.push(`This email must include an "Order/details" block so the transactional details aren't dropped.`);
  for (const b of c.blocks ?? []) if (b.type === "cta" && b.ctaHref) {
    const h = b.ctaHref.trim(); const scheme = h.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
    if (scheme && !SAFE_SCHEMES.has(scheme)) errors.push(`Button URL has an unsafe protocol: ${h}`);
    else if (!scheme && !h.startsWith("/") && !h.startsWith("{{") && !h.startsWith("#")) warnings.push(`Button URL "${h}" may be malformed.`);
  }
  return { errors, warnings };
}

// ── Send path (reads PUBLISHED scalars — UNCHANGED behaviour) ─────────────────────────────────────────
export async function getEmailTemplate(key: string): Promise<EmailTemplate | null> {
  const def = DEF_BY_KEY.get(key);
  if (!def) return null;
  let row: any = null;
  try { const db = createAdminClient() as any; row = (await db.from("email_templates").select("*").eq("key", key).maybeSingle()).data; } catch { /* fall back to default */ }
  return { key, def, source: row ? "db" : "default", ...publishedFromRow(row, def) };
}

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  let rows: any[] = [];
  try { const db = createAdminClient() as any; rows = (await db.from("email_templates").select("*")).data ?? []; } catch { /* defaults */ }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return EMAIL_TEMPLATE_DEFS.map((def) => ({ key: def.key, def, source: (byKey.get(def.key) ? "db" : "default") as "db" | "default", ...publishedFromRow(byKey.get(def.key), def) }));
}

/** Log an unresolved-token defect through the canonical audit log (defense-in-depth signal). */
function logRenderDefect(key: string, where: string, unknown: string[]) {
  if (!unknown.length) return;
  void logEvent({ entityType: "settings", event: "email_template.render_unknown_token", actorType: "system", notes: `${key} · ${where} · ${unknown.map((t) => `{{${t}}}`).join(", ")}` }).catch(() => {});
}

/** Send-path subject: the PUBLISHED override interpolated (unknowns blank + logged), else the default. */
export async function resolveSubject(key: string, fallback: string, vars: Record<string, string>): Promise<string> {
  try {
    const t = await getEmailTemplate(key);
    if (t && t.enabled && t.source === "db" && t.subject) { const { text, unknown } = interpolateTracked(t.subject, vars); logRenderDefect(key, "subject", unknown); return text; }
  } catch { /* ignore */ }
  return fallback;
}

/** Send-path authored body: render the PUBLISHED blocks, else null (caller uses the coded builder). */
export async function renderAuthoredEmail(key: string, vars: Record<string, string>): Promise<{ subject: string; html: string; text: string } | null> {
  try {
    const t = await getEmailTemplate(key);
    if (!t || !t.enabled || !t.blocks?.length) return null;
    const scan = new Set<string>();
    for (const s of [t.subject, t.preheader, t.eyebrow, t.heading]) interpolateTracked(s ?? "", vars).unknown.forEach((u) => scan.add(u));
    for (const b of t.blocks) for (const s of [b.text, b.ctaLabel, b.ctaHref]) interpolateTracked(s ?? "", vars).unknown.forEach((u) => scan.add(u));
    logRenderDefect(key, "body", [...scan].filter((u) => u !== "details"));
    const { html, text } = renderEmailBlocks({ subject: t.subject, preheader: t.preheader, eyebrow: t.eyebrow, heading: t.heading, blocks: t.blocks }, vars);
    return { subject: interpolate(t.subject, vars), html, text };
  } catch { return null; }
}

/**
 * Render a GIVEN content (draft or published) for admin PREVIEW / SEND-TEST — the same block renderer +
 * token path production uses. `detailsHtml` is the transactional details injection (sample or real).
 */
export function renderTemplateContent(def: EmailTemplateDef, c: EmailContent, vars: Record<string, string>, detailsHtml: string): { subject: string; html: string; text: string; authored: boolean } {
  const subject = interpolate((c.subject || def.defaultSubject), vars);
  if (c.enabled && (c.blocks?.length ?? 0) > 0) {
    const { html, text } = renderEmailBlocks({ subject: c.subject, preheader: c.preheader, eyebrow: c.eyebrow, heading: c.heading, blocks: c.blocks }, { ...vars, details: detailsHtml });
    return { subject, html, text, authored: true };
  }
  // No authored body → the coded default is what actually sends; represent it with the details injection.
  const { html, text } = renderEmailBlocks({ subject: c.subject, preheader: c.preheader, eyebrow: c.eyebrow, heading: c.heading, blocks: [{ type: "details" }] }, { ...vars, details: detailsHtml });
  return { subject, html, text, authored: false };
}

// ── Admin (draft / publish / reset / revisions) ──────────────────────────────────────────────────────
export async function getEmailTemplateAdmin(key: string): Promise<EmailTemplateAdmin | null> {
  const def = DEF_BY_KEY.get(key);
  if (!def) return null;
  let row: any = null;
  try { const db = createAdminClient() as any; row = (await db.from("email_templates").select("*").eq("key", key).maybeSingle()).data; } catch { /* default */ }
  const published = publishedFromRow(row, def);
  const draft = (row?.draft && typeof row.draft === "object") ? { ...published, ...row.draft } as EmailContent : published;
  return { key, def, published, draft, status: row?.draft ? "draft" : "published", source: row ? "db" : "default" };
}
export async function listEmailTemplatesAdmin(): Promise<EmailTemplateAdmin[]> {
  return Promise.all(EMAIL_TEMPLATE_DEFS.map((d) => getEmailTemplateAdmin(d.key) as Promise<EmailTemplateAdmin>));
}

const cleanContent = (c: Partial<EmailContent>, base: EmailContent): EmailContent => ({
  subject: c.subject ?? base.subject, preheader: c.preheader ?? base.preheader, intro: c.intro ?? base.intro, signoff: c.signoff ?? base.signoff,
  eyebrow: c.eyebrow ?? base.eyebrow, heading: c.heading ?? base.heading, blocks: Array.isArray(c.blocks) ? c.blocks : base.blocks, enabled: c.enabled ?? base.enabled,
});

/** Save the DRAFT (never touches the published scalars). */
export async function saveEmailTemplateDraft(key: string, patch: Partial<EmailContent>, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const def = DEF_BY_KEY.get(key);
  if (!def) return { ok: false, reason: "unknown template" };
  const admin = await getEmailTemplateAdmin(key);
  const draft = cleanContent(patch, admin?.draft ?? emptyContent(def));
  const db = createAdminClient() as any;
  const { error } = await db.from("email_templates").upsert({ key, draft, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "email_template.draft_saved", actorType: actorId ? "staff" : "system", actorId, notes: key });
  return { ok: true };
}

/** Publish the DRAFT: validate → snapshot → atomically promote into the published scalars → clear draft. */
export async function publishEmailTemplate(key: string, actorId?: string): Promise<{ ok: boolean; reason?: string; errors?: string[] }> {
  const def = DEF_BY_KEY.get(key);
  if (!def) return { ok: false, reason: "unknown template" };
  const admin = await getEmailTemplateAdmin(key);
  if (!admin || admin.status !== "draft") return { ok: false, reason: "nothing to publish" };
  const v = validateEmailTemplate(def, admin.draft);
  if (v.errors.length) return { ok: false, reason: v.errors[0], errors: v.errors };
  const d = admin.draft;
  await snapshotRevision("email", key, d, actorId); // the version going live — immutable history
  const db = createAdminClient() as any;
  const { error } = await db.from("email_templates").upsert({
    key, subject: d.subject || null, preheader: d.preheader || null, intro: d.intro || null, signoff: d.signoff || null,
    eyebrow: d.eyebrow || null, heading: d.heading || null, blocks: d.blocks ?? [], enabled: d.enabled !== false,
    draft: null, updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "email_template.published", actorType: actorId ? "staff" : "system", actorId, notes: key });
  return { ok: true };
}

/** Restore to the Samorah coded default: snapshot the current published (not destroyed), disable the
 *  override so the send path uses the coded builder, and clear any draft. */
export async function resetEmailTemplate(key: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const def = DEF_BY_KEY.get(key);
  if (!def) return { ok: false, reason: "unknown template" };
  const admin = await getEmailTemplateAdmin(key);
  if (admin && admin.source === "db") await snapshotRevision("email", key, admin.published, actorId, "before reset to default");
  const db = createAdminClient() as any;
  const { error } = await db.from("email_templates").upsert({ key, enabled: false, draft: null, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "email_template.reset", actorType: actorId ? "staff" : "system", actorId, notes: key });
  return { ok: true };
}

export async function listEmailRevisions(key: string, limit = 30): Promise<Revision[]> { return listCmsRevisions("email", key, limit); }
/** Restore a past revision into the DRAFT (non-destructive — review, then publish). */
export async function restoreEmailRevision(key: string, revisionId: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const snap = await getRevisionSnapshot(revisionId);
  if (!snap || typeof snap !== "object") return { ok: false, reason: "revision not found" };
  const res = await saveEmailTemplateDraft(key, snap as Partial<EmailContent>, actorId);
  if (res.ok) await logEvent({ entityType: "settings", event: "email_template.restored", actorType: actorId ? "staff" : "system", actorId, notes: `${key} ← ${revisionId}` });
  return res;
}
