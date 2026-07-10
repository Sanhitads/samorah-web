"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EmailTemplate } from "@/services/emailTemplateService";

/** Interpolate {{token}} against sample vars for the live preview. */
function preview(str: string, vars: Record<string, string>): string {
  return String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{{${k}}}`));
}

export function EmailTemplatesManager({ templates }: { templates: EmailTemplate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(templates[0]?.key ?? null);
  const [drafts, setDrafts] = useState<Record<string, Partial<EmailTemplate>>>({});

  const valueOf = (t: EmailTemplate, field: "subject" | "preheader" | "intro" | "signoff") => (drafts[t.key]?.[field] ?? t[field]) as string;
  const setField = (key: string, field: string, v: string) => setDrafts((d) => ({ ...d, [key]: { ...d[key], [field]: v } }));

  const save = async (t: EmailTemplate) => {
    setBusy(true); setMsg(null);
    try {
      const patch = drafts[t.key] ?? {};
      const res = await fetch("/api/admin/emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: t.key, patch }) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setMsg({ tone: "err", text: d.error ?? d.reason ?? "Failed" }); return; }
      setMsg({ tone: "ok", text: "Saved — live on the next send." });
      startTransition(() => router.refresh());
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error" }); }
  };

  return (
    <div className="cfg">
      <p className="cfg-hint">Subject lines are live on the next send. Preheader / intro / signoff are saved and will apply as each email body adopts them.</p>
      {templates.map((t) => (
        <div key={t.key} className="nav-branch">
          <div className="nav-branch__head">
            <span className="hp-section__name">{t.def.label}<span className="admin__muted"> · {t.key}</span></span>
            <span className="adm-badge">{t.source === "db" ? "customised" : "default"}</span>
            <button type="button" className="ff-btn" onClick={() => setOpen(open === t.key ? null : t.key)}>{open === t.key ? "Close" : "Edit"}</button>
          </div>
          {open === t.key ? (
            <div>
              <p className="cfg-hint">Variables: {t.def.vars.map((v) => <code key={v}>{`{{${v}}}`}</code>).reduce((a, b) => <>{a} {b}</>)}</p>
              <label className="cfg-field"><span>Subject (live)</span><input value={valueOf(t, "subject")} onChange={(e) => setField(t.key, "subject", e.target.value)} /></label>
              <div className="email-preview"><span className="admin__muted">Preview:</span> {preview(valueOf(t, "subject"), t.def.sample)}</div>
              <div className="cfg-grid">
                <label className="cfg-field"><span>Preheader (saved)</span><input value={valueOf(t, "preheader")} onChange={(e) => setField(t.key, "preheader", e.target.value)} /></label>
                <label className="cfg-field"><span>Signoff (saved)</span><input value={valueOf(t, "signoff")} onChange={(e) => setField(t.key, "signoff", e.target.value)} /></label>
              </div>
              <label className="cfg-field" data-wide="1"><span>Intro copy (saved)</span><textarea rows={2} value={valueOf(t, "intro")} onChange={(e) => setField(t.key, "intro", e.target.value)} /></label>
              <div className="cfg-actions">
                <button type="button" className="ff-btn ff-btn--primary" disabled={busy || pending} onClick={() => save(t)}>Save</button>
                {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
              </div>
            </div>
          ) : (
            <p className="admin__muted" style={{ margin: "6px 0 0" }}>{preview(valueOf(t, "subject"), t.def.sample)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
