/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Email Template service (CMS slice 5) — transactional email copy as content. Each
 * template is keyed by its notification event and declares the {{tokens}} available
 * to it. The send path reads the DB override (subject today; preheader/intro/signoff
 * stored for builders as they adopt them) and interpolates tokens, falling back to
 * the hardcoded default — so a subject line changes without a deploy.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { renderEmailBlocks, interpolate as interpBlocks, type EmailBlock } from "@/lib/email/blocks";

export interface EmailTemplateDef { key: string; label: string; vars: string[]; sample: Record<string, string>; defaultSubject: string }

export const EMAIL_TEMPLATE_DEFS: EmailTemplateDef[] = [
  { key: "order.confirmed", label: "Order confirmation", vars: ["orderNumber", "name", "total"], sample: { orderNumber: "SAM1042", name: "Aarohi", total: "₹2,480" }, defaultSubject: "Your Samorah order {{orderNumber}} is confirmed" },
  { key: "order.dispatched", label: "Order dispatched", vars: ["orderNumber", "name", "courier", "awb"], sample: { orderNumber: "SAM1042", name: "Aarohi", courier: "Delhivery", awb: "DL1234567" }, defaultSubject: "Your order {{orderNumber}} is on its way" },
  { key: "order.cancelled", label: "Order cancelled", vars: ["orderNumber", "name"], sample: { orderNumber: "SAM1042", name: "Aarohi" }, defaultSubject: "Your Samorah order {{orderNumber}} was cancelled" },
  { key: "delivery.completed", label: "Order delivered", vars: ["orderNumber", "name"], sample: { orderNumber: "SAM1042", name: "Aarohi" }, defaultSubject: "Your Samorah order {{orderNumber}} has arrived" },
  { key: "return.requested", label: "Return requested", vars: ["rmaNumber", "orderNumber"], sample: { rmaNumber: "RMA-88", orderNumber: "SAM1042" }, defaultSubject: "We've received your return request {{rmaNumber}}" },
  { key: "return.approved", label: "Return approved", vars: ["rmaNumber", "orderNumber"], sample: { rmaNumber: "RMA-88", orderNumber: "SAM1042" }, defaultSubject: "Your return {{rmaNumber}} is approved" },
  { key: "return.refunded", label: "Return refunded", vars: ["rmaNumber", "orderNumber"], sample: { rmaNumber: "RMA-88", orderNumber: "SAM1042" }, defaultSubject: "Your refund for {{rmaNumber}} is on its way" },
];

const DEF_BY_KEY = new Map(EMAIL_TEMPLATE_DEFS.map((d) => [d.key, d]));

export interface EmailTemplate { key: string; subject: string; preheader: string; intro: string; signoff: string; eyebrow: string; heading: string; blocks: EmailBlock[]; enabled: boolean; source: "db" | "default"; def: EmailTemplateDef }

/** Interpolate {{token}} against vars; unknown tokens are left visible (never blank). */
export function interpolate(str: string, vars: Record<string, string>): string {
  return String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{{${k}}}`));
}

/** One template merged over its default. */
export async function getEmailTemplate(key: string): Promise<EmailTemplate | null> {
  const def = DEF_BY_KEY.get(key);
  if (!def) return null;
  let row: any = null;
  try { const db = createAdminClient() as any; row = (await db.from("email_templates").select("*").eq("key", key).maybeSingle()).data; } catch { /* fall back */ }
  return {
    key, def, source: row ? "db" : "default",
    subject: row?.subject || def.defaultSubject, preheader: row?.preheader ?? "", intro: row?.intro ?? "", signoff: row?.signoff ?? "",
    eyebrow: row?.eyebrow ?? "", heading: row?.heading ?? "", blocks: Array.isArray(row?.blocks) ? row.blocks : [],
    enabled: row ? row.enabled !== false : true,
  };
}

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  let rows: any[] = [];
  try { const db = createAdminClient() as any; rows = (await db.from("email_templates").select("*")).data ?? []; } catch { /* defaults */ }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return EMAIL_TEMPLATE_DEFS.map((def) => {
    const row = byKey.get(def.key);
    return { key: def.key, def, source: (row ? "db" : "default") as "db" | "default", subject: row?.subject || def.defaultSubject, preheader: row?.preheader ?? "", intro: row?.intro ?? "", signoff: row?.signoff ?? "", eyebrow: row?.eyebrow ?? "", heading: row?.heading ?? "", blocks: Array.isArray(row?.blocks) ? row.blocks : [], enabled: row ? row.enabled !== false : true };
  });
}

export async function saveEmailTemplate(key: string, patch: { subject?: string; preheader?: string; intro?: string; signoff?: string; eyebrow?: string; heading?: string; blocks?: EmailBlock[]; enabled?: boolean }, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  if (!DEF_BY_KEY.has(key)) return { ok: false, reason: "unknown template" };
  const db = createAdminClient() as any;
  const row: any = { key, updated_at: new Date().toISOString() };
  for (const k of ["subject", "preheader", "intro", "signoff", "eyebrow", "heading"] as const) if (patch[k] !== undefined) row[k] = patch[k] || null;
  if (patch.blocks !== undefined) row.blocks = Array.isArray(patch.blocks) ? patch.blocks : [];
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  const { error } = await db.from("email_templates").upsert(row, { onConflict: "key" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "email_template.saved", actorType: actorId ? "staff" : "system", actorId, notes: key });
  return { ok: true };
}

/**
 * The send-path hook: given the hardcoded default subject + the event's vars, return
 * the DB override interpolated (or the default). Never throws — email must not break.
 */
export async function resolveSubject(key: string, fallback: string, vars: Record<string, string>): Promise<string> {
  try {
    const t = await getEmailTemplate(key);
    if (t && t.enabled && t.source === "db" && t.subject) return interpolate(t.subject, vars);
  } catch { /* ignore */ }
  return fallback;
}

/**
 * If a template has an AUTHORED block body, render the full email from it (subject +
 * block-composed HTML). Returns null when no blocks are authored — the caller then
 * uses the hardcoded builder (no regression). `vars.details` may hold transactional
 * HTML (an order table) for a "details" block to inject.
 */
export async function renderAuthoredEmail(key: string, vars: Record<string, string>): Promise<{ subject: string; html: string; text: string } | null> {
  try {
    const t = await getEmailTemplate(key);
    if (!t || !t.enabled || !t.blocks?.length) return null;
    const { html, text } = renderEmailBlocks({ subject: t.subject, preheader: t.preheader, eyebrow: t.eyebrow, heading: t.heading, blocks: t.blocks }, vars);
    return { subject: interpBlocks(t.subject, vars), html, text };
  } catch { return null; }
}
