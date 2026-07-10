"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MediaRow } from "@/services/media/mediaService";

const ROLES = ["hero", "support", "detail", "portrait", "lifestyle", "texture", "background"];

export function MediaManager({ items, folders, canManage, uploadsOn, folder, q }: {
  items: MediaRow[]; folders: string[]; canManage: boolean; uploadsOn: boolean; folder: string; q: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<MediaRow | null>(null);
  const [usage, setUsage] = useState<{ type: string; id: string; context?: string }[] | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [urlForm, setUrlForm] = useState({ url: "", title: "", alt: "", folder: "general" });
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => startTransition(() => router.refresh());

  const nav = (next: { folder?: string; q?: string }) => {
    const f = next.folder ?? folder; const query = next.q ?? q;
    const p = new URLSearchParams();
    if (f && f !== "all") p.set("folder", f);
    if (query) p.set("q", query);
    startTransition(() => router.push(`/admin/media${p.toString() ? `?${p}` : ""}`));
  };

  const postJson = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return d; }
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };

  const onFile = async (file: File) => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (folder && folder !== "all") fd.append("folder", folder);
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Upload failed"); return; }
      refresh();
    } catch { setBusy(false); setErr("Upload failed"); }
  };

  const registerUrl = async () => {
    if (!urlForm.url.trim()) return;
    const d = await postJson({ action: "register", media: { url: urlForm.url, title: urlForm.title, alt: urlForm.alt, folder: urlForm.folder, provider: "external" } });
    if (d?.ok) { setShowUrl(false); setUrlForm({ url: "", title: "", alt: "", folder: "general" }); refresh(); }
  };

  const saveEdit = async () => {
    if (!edit) return;
    const d = await postJson({ action: "update", id: edit.id, patch: { alt: edit.alt, title: edit.title, role: edit.role, folder: edit.folder, tags: edit.tags } });
    if (d?.ok) { setEdit(null); refresh(); }
  };

  const openUsage = async (id: string) => { const d = await postJson({ action: "usage", id }); if (d?.usage) setUsage(d.usage.usedBy); };
  const del = async (id: string) => {
    const d = await postJson({ action: "delete", id });
    if (d?.ok) refresh();
    else if (d?.usage) setUsage(d.usage.usedBy);
  };

  return (
    <div className="cfg">
      <div className="adm-filters" style={{ marginBottom: 12 }}>
        <select value={folder} onChange={(e) => nav({ folder: e.target.value })}>
          <option value="all">All folders</option>
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); nav({ q: String(fd.get("q") ?? "") }); }}>
          <input className="adm-filters__search" type="search" name="q" defaultValue={q} placeholder="Search title / alt…" />
        </form>
        {canManage ? (
          <>
            <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !uploadsOn} onClick={() => fileRef.current?.click()} title={uploadsOn ? "" : "Storage not configured"}>Upload</button>
            <button type="button" className="ff-btn" disabled={busy} onClick={() => setShowUrl((v) => !v)}>Register URL</button>
            <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </>
        ) : null}
        {pending || busy ? <span className="ff-refreshing">working…</span> : null}
        {err ? <span className="ff-err">{err}</span> : null}
      </div>

      {showUrl ? (
        <div className="cfg-grid" style={{ marginBottom: 14, alignItems: "end" }}>
          <label className="cfg-field"><span>Asset URL</span><input value={urlForm.url} onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })} placeholder="https://res.cloudinary.com/…" /></label>
          <label className="cfg-field"><span>Title</span><input value={urlForm.title} onChange={(e) => setUrlForm({ ...urlForm, title: e.target.value })} /></label>
          <label className="cfg-field"><span>Alt</span><input value={urlForm.alt} onChange={(e) => setUrlForm({ ...urlForm, alt: e.target.value })} /></label>
          <label className="cfg-field"><span>Folder</span><input value={urlForm.folder} onChange={(e) => setUrlForm({ ...urlForm, folder: e.target.value })} /></label>
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={registerUrl}>Add</button>
        </div>
      ) : null}

      {items.length ? (
        <div className="media-grid">
          {items.map((m) => (
            <figure key={m.id} className="media-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt || m.title || "asset"} loading="lazy" className="media-card__img" />
              <figcaption className="media-card__cap">
                <span className="media-card__title" title={m.title}>{m.title || m.url.split("/").pop()}</span>
                <span className="admin__muted">{m.folder}{m.width ? ` · ${m.width}×${m.height}` : ""}{m.alt ? "" : " · no alt"}</span>
              </figcaption>
              {canManage ? (
                <div className="media-card__actions">
                  <button type="button" className="ff-btn" onClick={() => setEdit(m)}>Edit</button>
                  <button type="button" className="ff-btn" onClick={() => openUsage(m.id)}>Usage</button>
                  <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => del(m.id)}>Delete</button>
                </div>
              ) : null}
            </figure>
          ))}
        </div>
      ) : <p className="admin__empty">No assets yet. Upload an image or register an existing URL.</p>}

      {edit ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEdit(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Edit asset</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={edit.url} alt="" className="media-edit__preview" />
            <label className="cfg-field"><span>Title</span><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
            <label className="cfg-field"><span>Alt text (accessibility — leave blank if decorative)</span><input value={edit.alt} onChange={(e) => setEdit({ ...edit, alt: e.target.value })} /></label>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Role</span><select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
              <label className="cfg-field"><span>Folder</span><input value={edit.folder} onChange={(e) => setEdit({ ...edit, folder: e.target.value })} /></label>
            </div>
            <label className="cfg-field"><span>Tags (comma-separated)</span><input value={edit.tags.join(", ")} onChange={(e) => setEdit({ ...edit, tags: e.target.value.split(",").map((t) => t.trim()) })} /></label>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions"><button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button><button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={saveEdit}>{busy ? "Saving…" : "Save"}</button></div>
          </div>
        </div>
      ) : null}

      {usage ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => setUsage(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Where it's used</h2>
            {usage.length ? (
              <ul className="rev-list">{usage.map((u, i) => <li key={i} className="rev-item"><span className="rev-item__when">{u.type}</span><span className="rev-item__meta admin__muted">{u.context ?? u.id}</span></li>)}</ul>
            ) : <p className="admin__muted">Not referenced anywhere — safe to delete.</p>}
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setUsage(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
