"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HomepageAdminView, HomeSection, SectionType } from "@/services/homepageService";
import type { Revision } from "@/services/cms/revisions";

type Meta = { type: SectionType; label: string; note: string };
const toLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
function move<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir; if (j < 0 || j >= arr.length) return arr;
  const next = [...arr]; [next[i], next[j]] = [next[j], next[i]]; return next;
}

export function HomepageManager({ view, sectionMeta }: { view: HomepageAdminView; sectionMeta: Meta[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [sections, setSections] = useState<HomeSection[]>(view.draft);
  const [pubAt, setPubAt] = useState(toLocal(view.publishAt));
  const [unpubAt, setUnpubAt] = useState(toLocal(view.unpublishAt));
  const [addType, setAddType] = useState<SectionType>(sectionMeta[0].type);
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  const [revs, setRevs] = useState<Revision[] | null>(null);
  const labelOf = (t: string) => sectionMeta.find((m) => m.type === t)?.label ?? t;

  // Renumber sortOrder from current array order before sending.
  const withOrder = () => sections.map((s, i) => ({ ...s, sortOrder: i }));

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/homepage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setMsg({ tone: "err", text: d.error ?? d.reason ?? "Failed" }); return d; }
      startTransition(() => router.refresh()); return d;
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error" }); return null; }
  };

  const save = async () => { const d = await post({ action: "save", sections: withOrder() }); if (d?.ok) setMsg({ tone: "ok", text: "Draft saved." }); };
  const publish = async () => { const d = await post({ action: "publish", sections: withOrder(), publishAt: fromLocal(pubAt), unpublishAt: fromLocal(unpubAt) }); if (d?.ok) setMsg({ tone: "ok", text: pubAt ? "Scheduled." : "Published live." }); };
  const reset = async () => { const d = await post({ action: "reset" }); if (d?.ok) setMsg({ tone: "ok", text: "Reset to default." }); };
  const openRevs = async () => { const d = await post({ action: "revisions" }); if (d?.revisions) setRevs(d.revisions); };
  const restore = async (id: string) => { const d = await post({ action: "restore", id }); if (d?.ok) { setRevs(null); setMsg({ tone: "ok", text: "Restored into draft — review, then publish." }); } };
  const preview = async () => { await post({ action: "save", sections: withOrder() }); document.cookie = "hp_preview=1; path=/; max-age=300"; window.open("/", "_blank", "noopener"); };

  const setSection = (i: number, patch: Partial<HomeSection>) => setSections((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addSection = () => setSections((s) => [...s, { id: `${addType}-${s.length}`, type: addType, enabled: true, sortOrder: s.length, settings: {} }]);

  return (
    <div className="cfg">
      <ol className="hp-list">
        {sections.map((s, i) => (
          <li key={s.id} className="hp-section" data-off={s.enabled ? "0" : "1"}>
            <div className="hp-section__row">
              <span className="hp-section__ord admin__mono">{i + 1}</span>
              <span className="hp-section__name">{labelOf(s.type)}<span className="admin__muted"> · {s.type}</span></span>
              <button type="button" className="cfg-toggle" data-on={s.enabled ? "1" : "0"} onClick={() => setSection(i, { enabled: !s.enabled })}>{s.enabled ? "Shown" : "Hidden"}</button>
              <span className="ff-actions">
                <button type="button" className="ff-btn" onClick={() => setOpenSettings(openSettings === s.id ? null : s.id)}>Settings</button>
                <button type="button" className="ff-btn" disabled={i === 0} onClick={() => setSections((x) => move(x, i, -1))}>↑</button>
                <button type="button" className="ff-btn" disabled={i === sections.length - 1} onClick={() => setSections((x) => move(x, i, 1))}>↓</button>
                <button type="button" className="ff-btn ff-btn--danger" onClick={() => setSections((x) => x.filter((_, j) => j !== i))}>Remove</button>
              </span>
            </div>
            {openSettings === s.id ? (
              <div className="hp-settings">
                <label className="cfg-field"><span>Advanced settings (JSON) — per-section overrides</span>
                  <textarea rows={3} defaultValue={JSON.stringify(s.settings ?? {}, null, 2)} onBlur={(e) => { try { setSection(i, { settings: JSON.parse(e.target.value || "{}") }); setMsg(null); } catch { setMsg({ tone: "err", text: `Invalid JSON in ${labelOf(s.type)} settings` }); } }} />
                </label>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="cfg-actions" style={{ marginTop: 10 }}>
        <select value={addType} onChange={(e) => setAddType(e.target.value as SectionType)}>{sectionMeta.map((m) => <option key={m.type} value={m.type}>{m.label}</option>)}</select>
        <button type="button" className="ff-btn" onClick={addSection}>+ Add section</button>
      </div>

      <div className="nav-publish">
        <div className="cfg-grid">
          <label className="cfg-field"><span>Publish at (optional — schedule)</span><input type="datetime-local" value={pubAt} onChange={(e) => setPubAt(e.target.value)} /></label>
          <label className="cfg-field"><span>Unpublish at (optional)</span><input type="datetime-local" value={unpubAt} onChange={(e) => setUnpubAt(e.target.value)} /></label>
        </div>
        <div className="cfg-actions">
          <button type="button" className="ff-btn" disabled={busy || pending} onClick={save}>Save draft</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={preview}>Preview</button>
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={publish}>{pubAt ? "Schedule" : "Publish"}</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={openRevs}>History</button>
          {view.source === "db" ? <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={reset}>Reset to default</button> : null}
          {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
        </div>
      </div>

      {revs ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => setRevs(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">History · homepage</h2>
            {revs.length ? (
              <ul className="rev-list">{revs.map((r) => (
                <li key={r.id} className="rev-item">
                  <span className="rev-item__when">{new Date(r.createdAt).toLocaleString()}</span>
                  <span className="rev-item__meta admin__muted">{r.label ?? "published"}</span>
                  <button type="button" className="ff-btn" disabled={busy} onClick={() => restore(r.id)}>Restore to draft</button>
                </li>
              ))}</ul>
            ) : <p className="admin__empty">No published versions yet.</p>}
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setRevs(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
