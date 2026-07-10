"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EmailTemplate } from "@/services/emailTemplateService";
import type { FieldDef } from "@/lib/cms/sectionSchema";
import { SchemaForm, type MediaOption } from "./SchemaForm";

/**
 * Email Template Manager — edits transactional email BODIES as structured blocks via
 * the same SchemaForm as the Homepage (no HTML editor). Subject is live on the next
 * send; an authored block body (when present) replaces the hardcoded builder. Live
 * server-rendered preview.
 */
export function EmailTemplatesManager({ templates, fields, media }: { templates: EmailTemplate[]; fields: FieldDef[]; media: MediaOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, Record<string, unknown>>>({});
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const valuesOf = (t: EmailTemplate): Record<string, unknown> =>
    vals[t.key] ?? { subject: t.subject, preheader: t.preheader, eyebrow: t.eyebrow, heading: t.heading, blocks: t.blocks };
  const setVal = (key: string, field: string, v: unknown) => setVals((s) => ({ ...s, [key]: { ...valuesOfKey(key), [field]: v } }));
  const valuesOfKey = (key: string) => vals[key] ?? valuesOf(templates.find((t) => t.key === key)!);

  const api = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  };

  const save = async (t: EmailTemplate) => {
    setBusy(true); setMsg(null);
    try {
      const d = await api({ key: t.key, patch: valuesOf(t) }); setBusy(false);
      if (d.ok === false) { setMsg({ tone: "err", text: d.error ?? d.reason ?? "Failed" }); return; }
      setMsg({ tone: "ok", text: "Saved — live on the next send." }); startTransition(() => router.refresh());
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error" }); }
  };
  const preview = async (t: EmailTemplate) => { setBusy(true); const d = await api({ action: "preview", key: t.key, patch: valuesOf(t) }); setBusy(false); if (d.html) setPreviewHtml(d.html); };

  return (
    <div className="cfg">
      <p className="cfg-hint">Subject is live on the next send. Add body <strong>blocks</strong> to author the full email (structured, not HTML) — an authored body replaces the coded default; leave blocks empty to keep it.</p>
      {templates.map((t) => (
        <div key={t.key} className="nav-branch">
          <div className="nav-branch__head">
            <span className="hp-section__name">{t.def.label}<span className="admin__muted"> · {t.key}</span></span>
            <span className="adm-badge">{t.blocks?.length ? "authored body" : t.source === "db" ? "custom subject" : "default"}</span>
            <button type="button" className="ff-btn" onClick={() => setOpen(open === t.key ? null : t.key)}>{open === t.key ? "Close" : "Edit"}</button>
          </div>
          {open === t.key ? (
            <div>
              <p className="cfg-hint">Variables: {t.def.vars.map((v) => <code key={v}>{`{{${v}}}`}</code>).reduce((a, b) => <>{a} {b}</>)}</p>
              <SchemaForm fields={fields} values={valuesOf(t)} media={media} onChange={(k, v) => setVal(t.key, k, v)} />
              <div className="cfg-actions">
                <button type="button" className="ff-btn ff-btn--primary" disabled={busy || pending} onClick={() => save(t)}>Save</button>
                <button type="button" className="ff-btn" disabled={busy} onClick={() => preview(t)}>Preview</button>
                {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
              </div>
            </div>
          ) : (
            <p className="admin__muted" style={{ margin: "6px 0 0" }}>{t.subject}</p>
          )}
        </div>
      ))}

      {previewHtml !== null ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => setPreviewHtml(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Email preview</h2>
            <iframe title="Email preview" srcDoc={previewHtml} style={{ width: "100%", height: "60vh", border: "1px solid var(--ad-hair)", borderRadius: 4, background: "#fff" }} />
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setPreviewHtml(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
