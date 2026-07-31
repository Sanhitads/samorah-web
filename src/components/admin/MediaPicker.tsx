"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaRow } from "@/services/media/mediaService";
import { isCloudinary, cldCrop } from "@/lib/cloudinaryUrl";

/**
 * Media Library picker (Phase 5 · points 20/21/25) — a "Browse Media" modal used by the schema-form
 * media field instead of a bare URL box. Browse / Search / Folders / Tags / Recently used / Reuse /
 * Upload / Replace, plus per-image Crop + Focal point (baked into a Cloudinary delivery URL) and
 * inline Alt / Credit / Copyright editing (persisted to the asset). Selecting returns a final URL.
 */
const RECENT_KEY = "samorah:recent-media";
const AR_PRESETS = [
  { k: "", label: "Original" }, { k: "1:1", label: "1:1" }, { k: "4:5", label: "4:5" },
  { k: "3:2", label: "3:2" }, { k: "16:9", label: "16:9" }, { k: "21:9", label: "21:9" },
];
const isVideoUrl = (v: string) => /^https?:\/\//.test(v) && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(v);

function readRecent(): string[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } }
function pushRecent(url: string) {
  try { const next = [url, ...readRecent().filter((u) => u !== url)].slice(0, 12); localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

export function MediaPicker({ open, kind = "image", allowCrop = true, onSelect, onClose }: {
  open: boolean; kind?: "image" | "video" | "all"; allowCrop?: boolean;
  onSelect: (url: string) => void; onClose: () => void;
}) {
  const [items, setItems] = useState<MediaRow[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [folder, setFolder] = useState("all");
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [sel, setSel] = useState<MediaRow | null>(null);
  const [ar, setAr] = useState("");
  const [focal, setFocal] = useState<{ x: number; y: number } | null>(null);
  const [meta, setMeta] = useState({ alt: "", credit: "", copyright: "", tags: "" });
  const [savingMeta, setSavingMeta] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const p = new URLSearchParams();
      if (folder !== "all") p.set("folder", folder);
      if (tag) p.set("tag", tag);
      if (q.trim()) p.set("q", q.trim());
      if (kind !== "all") p.set("kind", kind);
      const res = await fetch(`/api/admin/media?${p}`);
      const d = await res.json();
      if (!res.ok || d.ok === false) { setErr(d.error ?? "Failed to load"); setItems([]); }
      else { setItems(d.items ?? []); setFolders(d.folders ?? []); setTags(d.tags ?? []); }
    } catch { setErr("Network error"); }
    setLoading(false);
  }, [folder, tag, q, kind]);

  useEffect(() => { if (open) { setRecent(readRecent()); } }, [open]);
  useEffect(() => { if (!open) return; const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [open, load, q]);
  useEffect(() => { // reset the crop editor whenever a new asset is chosen
    if (!sel) return;
    setAr(""); setFocal(sel.focalX != null && sel.focalY != null ? { x: sel.focalX, y: sel.focalY } : null);
    setMeta({ alt: sel.alt, credit: sel.credit, copyright: sel.copyright, tags: sel.tags.join(", ") });
  }, [sel]);

  if (!open) return null;

  const cropped = (base: string) => (allowCrop && isCloudinary(base) ? cldCrop(base, { ar: ar || undefined, focalX: focal?.x, focalY: focal?.y }) : base);
  const choose = (url: string) => { pushRecent(url); onSelect(url); onClose(); };
  const confirmSel = () => { if (sel) choose(cropped(sel.url)); };

  const onUpload = async (file: File) => {
    setUploading(true); setErr("");
    try {
      const fd = new FormData(); fd.append("file", file); if (folder !== "all") fd.append("folder", folder);
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const d = await res.json(); setUploading(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Upload failed"); return; }
      if (d.url) { await load(); choose(d.url); }
    } catch { setUploading(false); setErr("Upload failed"); }
  };

  const saveMeta = async () => {
    if (!sel) return;
    setSavingMeta(true);
    try {
      await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id: sel.id, patch: { alt: meta.alt, credit: meta.credit, copyright: meta.copyright, tags: meta.tags.split(",").map((t) => t.trim()).filter(Boolean), focalX: focal?.x ?? null, focalY: focal?.y ?? null } }) });
    } catch { /* best-effort */ }
    setSavingMeta(false);
  };

  const setFocalFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setFocal({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };
  const objPos = focal ? `${(focal.x * 100).toFixed(1)}% ${(focal.y * 100).toFixed(1)}%` : "center";

  return (
    <div className="om-modal mp" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="om-modal__card mp__card" onClick={(e) => e.stopPropagation()}>
        <div className="mp__head">
          <h2 className="om-modal__title">Media Library</h2>
          <button type="button" className="ff-btn ff-btn--mini" onClick={onClose}>Close</button>
        </div>

        <div className="mp__filters">
          <input className="mp__search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / alt…" />
          <select value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="all">All folders</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
          <button type="button" className="ff-btn ff-btn--primary ff-btn--mini" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Uploading…" : "⬆ Upload"}</button>
          <input ref={fileRef} type="file" hidden accept={kind === "video" ? "video/mp4,video/webm" : kind === "all" ? "image/*,video/mp4,video/webm" : "image/*"} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
          {loading ? <span className="admin__muted">loading…</span> : null}
          {err ? <span className="ff-err">{err}</span> : null}
        </div>

        <div className="mp__body">
          <div className="mp__grid-wrap">
            {recent.length && !q && folder === "all" && !tag ? (
              <>
                <p className="mp__section">Recently used</p>
                <div className="mp__grid mp__grid--recent">
                  {recent.slice(0, 6).map((u) => (
                    <button key={u} type="button" className="mp__cell" onClick={() => choose(u)} title="Reuse">
                      {isVideoUrl(u) ? <video className="mp__thumb" src={u} muted /> : /* eslint-disable-next-line @next/next/no-img-element */ <img className="mp__thumb" src={u} alt="" loading="lazy" />}
                    </button>
                  ))}
                </div>
                <p className="mp__section">All media</p>
              </>
            ) : null}
            <div className="mp__grid">
              {items.map((m) => (
                <button key={m.id} type="button" className={`mp__cell${sel?.id === m.id ? " is-sel" : ""}`} onClick={() => setSel(m)} title={m.title || m.url}>
                  {m.kind === "video" || isVideoUrl(m.url) ? <video className="mp__thumb" src={m.url} muted /> : /* eslint-disable-next-line @next/next/no-img-element */ <img className="mp__thumb" src={m.url} alt={m.alt || ""} loading="lazy" />}
                  {!m.alt && m.kind !== "video" ? <span className="mp__noalt" title="No alt text">!</span> : null}
                </button>
              ))}
              {!items.length && !loading ? <p className="admin__empty">No assets. Upload one, or change filters.</p> : null}
            </div>
          </div>

          {sel ? (
            <aside className="mp__detail">
              {allowCrop && sel.kind !== "video" ? (
                <>
                  <p className="mp__section">Crop &amp; focal point</p>
                  <div className="mp__crop" style={{ aspectRatio: ar ? ar.replace(":", "/") : (sel.aspectRatio || "3/2") }} onClick={setFocalFromClick} title="Click to set the focal point">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sel.url} alt="" style={{ objectPosition: objPos }} />
                    {focal ? <span className="mp__focal" style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} /> : null}
                  </div>
                  <div className="mp__ars">
                    {AR_PRESETS.map((a) => <button key={a.k} type="button" className={`ff-btn ff-btn--mini${ar === a.k ? " is-active" : ""}`} onClick={() => setAr(a.k)}>{a.label}</button>)}
                  </div>
                  {!isCloudinary(sel.url) ? <small className="admin__muted">Crop bakes into Cloudinary URLs; this external image is used as-is (focal saved to the asset).</small> : null}
                </>
              ) : (
                <div className="mp__crop mp__crop--video">
                  {sel.kind === "video" || isVideoUrl(sel.url) ? <video src={sel.url} controls muted /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={sel.url} alt="" />}
                </div>
              )}

              <p className="mp__section">Details</p>
              <label className="cfg-field"><span>Alt text {sel.kind !== "video" && !meta.alt ? <span className="sf-warn">⚠ describe for accessibility</span> : null}</span><input value={meta.alt} onChange={(e) => setMeta({ ...meta, alt: e.target.value })} /></label>
              <label className="cfg-field"><span>Credit</span><input value={meta.credit} onChange={(e) => setMeta({ ...meta, credit: e.target.value })} placeholder="Photographer / source" /></label>
              <label className="cfg-field"><span>Copyright</span><input value={meta.copyright} onChange={(e) => setMeta({ ...meta, copyright: e.target.value })} placeholder="© 2026 …" /></label>
              <label className="cfg-field"><span>Tags (comma-separated)</span><input value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} /></label>
              <div className="mp__actions">
                <button type="button" className="ff-btn ff-btn--mini" disabled={savingMeta} onClick={saveMeta}>{savingMeta ? "Saving…" : "Save details"}</button>
                <button type="button" className="ff-btn ff-btn--primary" onClick={confirmSel}>Use this {sel.kind === "video" ? "video" : "image"}</button>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
