"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EmailTemplateAdmin } from "@/services/emailTemplateService";
import type { EmailHealth } from "@/services/emailDeliveryService";
import type { FieldDef } from "@/lib/cms/sectionSchema";
import { previewWidth, type PreviewMode } from "@/lib/email/preview";
import { SchemaForm, type MediaOption } from "./SchemaForm";

/**
 * Email Template Manager — transactional email copy as a DRAFT→PUBLISH resource.
 *
 * Editing/saving only touches the draft; the production send path keeps sending the PUBLISHED
 * version until an operator with content.publish publishes a validated draft. Preview + Send-Test
 * render through the same canonical renderer + token path as production (server-side). Publish is
 * blocked while validation reports errors (the server re-checks — the button is a UX shortcut, not
 * the gate). Reset-to-default and revision rollback route through the shared cms_revisions history.
 */
interface Validation { errors: string[]; warnings: string[] }
interface Revision { id: string; label: string | null; actorId: string | null; createdAt: string }

const HEALTH_LABEL: Record<string, string> = { healthy: "Healthy", degraded: "Recovered", failing: "Failing", idle: "No recent sends" };
const relTime = (iso: string | null): string => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
const fmtDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Operational status label for a template (point 14): source + custom body vs subject + live/draft. */
function statusBadge(t: EmailTemplateAdmin): { text: string; warn: boolean } {
  if (t.source !== "db") return { text: "DEFAULT", warn: false };
  const live = t.published.enabled ? "LIVE" : "OFF";
  const kind = t.published.blocks?.length ? "CUSTOM · BODY" : "CUSTOM";
  const parts = [kind, live];
  if (t.status === "draft") parts.push("DRAFT CHANGES");
  return { text: parts.join(" · "), warn: t.status === "draft" };
}

export function EmailTemplatesManager({ templates, fields, media, canPublish, health }: { templates: EmailTemplateAdmin[]; fields: FieldDef[]; media: MediaOption[]; canPublish: boolean; health: Record<string, EmailHealth> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, Record<string, unknown>>>({});
  const [valid, setValid] = useState<Record<string, Validation>>({});
  const [msg, setMsg] = useState<Record<string, { tone: string; text: string }>>({});
  const [testTo, setTestTo] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ html: string; authored: boolean } | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [history, setHistory] = useState<{ key: string; revisions: Revision[] } | null>(null);

  const draftOf = (t: EmailTemplateAdmin): Record<string, unknown> =>
    vals[t.key] ?? { subject: t.draft.subject, preheader: t.draft.preheader, eyebrow: t.draft.eyebrow, heading: t.draft.heading, blocks: t.draft.blocks };
  const setVal = (t: EmailTemplateAdmin, field: string, v: unknown) => setVals((s) => ({ ...s, [t.key]: { ...draftOf(t), [field]: v } }));
  const say = (key: string, tone: string, text: string) => setMsg((m) => ({ ...m, [key]: { tone, text } }));

  const api = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  const saveDraft = async (t: EmailTemplateAdmin) => {
    setBusy(true); setMsg((m) => ({ ...m, [t.key]: { tone: "", text: "" } }));
    const { data } = await api({ action: "save-draft", key: t.key, patch: draftOf(t) }); setBusy(false);
    if (data.error) { say(t.key, "err", data.error); return; }
    if (data.errors || data.warnings) setValid((v) => ({ ...v, [t.key]: { errors: data.errors ?? [], warnings: data.warnings ?? [] } }));
    say(t.key, "ok", "Draft saved — not yet live. Publish to send it to customers."); startTransition(() => router.refresh());
  };

  const doPreview = async (t: EmailTemplateAdmin) => {
    setBusy(true); const { data } = await api({ action: "preview", key: t.key, patch: draftOf(t) }); setBusy(false);
    if (data.error) { say(t.key, "err", data.error); return; }
    if (data.errors || data.warnings) setValid((v) => ({ ...v, [t.key]: { errors: data.errors ?? [], warnings: data.warnings ?? [] } }));
    if (data.html) setPreview({ html: data.html, authored: data.authored });
  };

  const publish = async (t: EmailTemplateAdmin) => {
    setBusy(true); const { data } = await api({ action: "publish", key: t.key }); setBusy(false);
    if (data.error) { setValid((v) => ({ ...v, [t.key]: { errors: data.errors ?? [data.error], warnings: valid[t.key]?.warnings ?? [] } })); say(t.key, "err", data.error); return; }
    say(t.key, "ok", "Published — live on the next send."); startTransition(() => router.refresh());
  };

  const sendTest = async (t: EmailTemplateAdmin) => {
    const to = (testTo[t.key] ?? "").trim();
    // Send the CURRENT editor content (same as Preview) so what you preview is what you test.
    setBusy(true); const { data } = await api({ action: "send-test", key: t.key, to, patch: draftOf(t) }); setBusy(false);
    if (data.error) { say(t.key, "err", data.error); return; }
    say(t.key, "ok", `Test sent to ${data.to} — marked [TEST], no customer/order state changed.`);
  };

  const reset = async (t: EmailTemplateAdmin) => {
    if (!confirm(`Restore "${t.def.label}" to the Samorah default? The current customization is kept in history and can be restored.`)) return;
    setBusy(true); const { data } = await api({ action: "reset", key: t.key }); setBusy(false);
    if (data.error) { say(t.key, "err", data.error); return; }
    setVals((s) => { const n = { ...s }; delete n[t.key]; return n; });
    say(t.key, "ok", "Restored to default (previous version saved in history)."); startTransition(() => router.refresh());
  };

  const openHistory = async (t: EmailTemplateAdmin) => {
    setBusy(true); const { data } = await api({ action: "revisions", key: t.key }); setBusy(false);
    setHistory({ key: t.key, revisions: data.revisions ?? [] });
  };
  const restore = async (key: string, revisionId: string) => {
    setBusy(true); const { data } = await api({ action: "restore", key, revisionId }); setBusy(false);
    if (data.error) { say(key, "err", data.error); return; }
    setVals((s) => { const n = { ...s }; delete n[key]; return n; }); setHistory(null);
    say(key, "ok", "Restored into the draft — review, then Publish to make it live."); startTransition(() => router.refresh());
  };

  const copyVar = (t: EmailTemplateAdmin, name: string) => {
    void navigator.clipboard?.writeText(`{{${name}}}`).then(() => say(t.key, "ok", `Copied {{${name}}} — paste it into a field.`)).catch(() => {});
  };

  return (
    <div className="cfg">
      <p className="cfg-hint">Edits are saved as a <strong>draft</strong> — customers keep receiving the published version until you <strong>Publish</strong>. The <strong>subject</strong> overrides the coded default on its own. Preheader, hero and <strong>blocks</strong> apply only when you author a full body (structured, not HTML) — leave blocks empty to keep the Samorah coded default email.</p>
      {templates.map((t) => {
        const v = valid[t.key]; const m = msg[t.key];
        const blocked = (v?.errors?.length ?? 0) > 0;
        const badge = statusBadge(t);
        const h = health[t.key];
        return (
          <div key={t.key} className="nav-branch">
            <div className="nav-branch__head">
              <span className="hp-section__name">{t.def.label}<span className="admin__muted"> · {t.key}</span></span>
              <span className={`adm-badge${badge.warn ? " adm-badge--warn" : ""}`}>{badge.text}</span>
              {t.updatedAt ? <span className="admin__muted em-updated">Updated {fmtDate(t.updatedAt)}</span> : null}
              {h ? (
                <Link href={`/admin/emails/deliveries?event=${encodeURIComponent(t.key)}`} className={`em-health em-health--${h.status}`} title={`Last sent ${relTime(h.lastSentAt)}${h.failed24h ? ` · ${h.failed24h} failed (24h)` : ""} — view delivery log`}>
                  <span className="em-health__dot" /> {HEALTH_LABEL[h.status] ?? h.status}{h.failed24h ? ` · ${h.failed24h} failed` : ""}
                </Link>
              ) : null}
              <button type="button" className="ff-btn" onClick={() => setOpen(open === t.key ? null : t.key)}>{open === t.key ? "Close" : "Edit"}</button>
            </div>
            {open === t.key ? (
              <div>
                <div className="cfg-hint" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span>Variables:</span>
                  {t.def.vars.map((name) => <button key={name} type="button" className="adm-chip" onClick={() => copyVar(t, name)} title="Copy token">{`{{${name}}}`}</button>)}
                  {t.def.requiresDetails ? <span className="admin__muted">· add an <strong>Order/details</strong> block so the order table isn&apos;t dropped</span> : null}
                </div>

                <SchemaForm fields={fields} values={draftOf(t)} media={media} onChange={(k, val) => setVal(t, k, val)} />

                {v && (v.errors.length || v.warnings.length) ? (
                  <div className="cfg-validation">
                    {v.errors.map((e, i) => <p key={`e${i}`} className="cfg-msg cfg-msg--err">⛔ {e}</p>)}
                    {v.warnings.map((w, i) => <p key={`w${i}`} className="cfg-msg cfg-msg--warn">⚠ {w}</p>)}
                  </div>
                ) : null}

                <div className="cfg-actions" style={{ flexWrap: "wrap" }}>
                  <button type="button" className="ff-btn ff-btn--primary" disabled={busy || pending} onClick={() => saveDraft(t)}>Save draft</button>
                  <button type="button" className="ff-btn" disabled={busy} onClick={() => doPreview(t)}>Preview</button>
                  {canPublish ? <button type="button" className="ff-btn" disabled={busy || pending || t.status !== "draft" || blocked} onClick={() => publish(t)} title={blocked ? "Fix the errors above before publishing" : t.status !== "draft" ? "No unpublished draft" : ""}>Publish</button> : null}
                  {canPublish ? <button type="button" className="ff-btn ff-btn--ghost" disabled={busy} onClick={() => openHistory(t)}>History</button> : null}
                  {canPublish && t.source === "db" ? <button type="button" className="ff-btn ff-btn--ghost" disabled={busy || pending} onClick={() => reset(t)}>Restore default</button> : null}
                </div>

                {canPublish ? (
                  <div className="cfg-actions" style={{ marginTop: 8 }}>
                    <input type="email" className="ff-input" placeholder="you@example.com" value={testTo[t.key] ?? ""} onChange={(e) => setTestTo((s) => ({ ...s, [t.key]: e.target.value }))} style={{ maxWidth: 240 }} />
                    <button type="button" className="ff-btn" disabled={busy} onClick={() => sendTest(t)}>Send test</button>
                    <span className="admin__muted">Sends the current draft, marked [TEST]. No order/customer state is touched.</span>
                  </div>
                ) : null}

                {m?.text ? <p className={`cfg-msg cfg-msg--${m.tone}`} style={{ marginTop: 8 }}>{m.text}</p> : null}
                <p className="admin__muted" style={{ marginTop: 8 }}>Published subject: <em>{t.published.subject}</em></p>
              </div>
            ) : (
              <p className="admin__muted" style={{ margin: "6px 0 0" }}>{t.published.subject}</p>
            )}
          </div>
        );
      })}

      {preview !== null ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => setPreview(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Email preview <span className="admin__muted">· {preview.authored ? "authored body" : "coded default"}</span></h2>
            <div className="em-preview__bar" role="group" aria-label="Preview width">
              <button type="button" className={`ff-btn ff-btn--sm${previewMode === "desktop" ? " ff-btn--primary" : ""}`} aria-pressed={previewMode === "desktop"} onClick={() => setPreviewMode("desktop")}>Desktop</button>
              <button type="button" className={`ff-btn ff-btn--sm${previewMode === "mobile" ? " ff-btn--primary" : ""}`} aria-pressed={previewMode === "mobile"} onClick={() => setPreviewMode("mobile")}>Mobile</button>
            </div>
            <div className="em-preview__stage">
              <iframe title="Email preview" srcDoc={preview.html} style={{ width: previewWidth(previewMode), maxWidth: "100%", height: "60vh", border: "1px solid var(--ad-hair)", borderRadius: 4, background: "#fff" }} />
            </div>
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setPreview(null)}>Close</button></div>
          </div>
        </div>
      ) : null}

      {history !== null ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => setHistory(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Revision history</h2>
            {history.revisions.length === 0 ? <p className="admin__muted">No revisions yet — publishing or resetting records a version here.</p> : (
              <ul className="adm-history">
                {history.revisions.map((r) => (
                  <li key={r.id} className="adm-history__row">
                    <span>{new Date(r.createdAt).toLocaleString()}{r.label ? ` · ${r.label}` : ""}{r.actorId ? <span className="admin__muted"> · {r.actorId.slice(0, 8)}</span> : null}</span>
                    <button type="button" className="ff-btn ff-btn--ghost" disabled={busy} onClick={() => restore(history.key, r.id)}>Restore to draft</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setHistory(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
