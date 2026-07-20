"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Customer evidence for one return: a gallery of the photos / video a customer sent in, an admin
 * upload control (reuses the Cloudinary media path via /api/admin/returns/evidence), per-item
 * delete, and a lightbox to open / zoom / browse images. Read-only for staff without
 * returns.operate — they still see the gallery, just no upload / delete controls.
 */
export interface Attachment {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  source: string | null;
}

export function ReturnEvidence({ returnId, attachments, canOperate, bare = false }: { returnId: string; attachments: Attachment[]; canOperate: boolean; bare?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [caption, setCaption] = useState("");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const images = attachments.filter((a) => a.kind === "image");
  const videos = attachments.filter((a) => a.kind === "video");

  const upload = async (file: File) => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("returnId", returnId);
      if (caption.trim()) fd.append("caption", caption.trim());
      const res = await fetch("/api/admin/returns/evidence", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Upload failed"); return; }
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      startTransition(() => router.refresh());
    } catch { setBusy(false); setErr("Network error"); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remove this evidence? This cannot be undone.")) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/returns/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Delete failed"); return; }
      startTransition(() => router.refresh());
    } catch { setBusy(false); setErr("Network error"); }
  };

  const step = useCallback((dir: number) => {
    setLightbox((i) => (i === null ? i : (i + dir + images.length) % images.length));
  }, [images.length]);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, step]);

  return (
    <section className="od-section">
      {!bare ? <h2 className="od-card__title">Customer evidence <span className="count-badge" data-empty={attachments.length === 0}>{attachments.length}</span></h2> : null}

      {attachments.length === 0 ? <p className="admin__muted">No evidence attached.</p> : null}

      {images.length ? (
        <div className="ret-evidence">
          {images.map((a, i) => (
            <div key={a.id} className="ret-evidence__item">
              <button type="button" className="ret-evidence__thumb" title={a.caption ?? "Open"} onClick={() => setLightbox(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.caption ?? "Return evidence"} />
              </button>
              {a.source && a.source !== "admin" ? <span className="ret-evidence__tag">{a.source}</span> : null}
              {canOperate ? <button type="button" className="ret-evidence__del" disabled={busy} onClick={() => remove(a.id)} title="Remove">×</button> : null}
            </div>
          ))}
        </div>
      ) : null}

      {videos.map((a) => (
        <p key={a.id} className="ret-evidence__video">
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-link">▶ Video{a.caption ? ` · ${a.caption}` : ""}</a>
          {canOperate ? <button type="button" className="ff-link-btn" disabled={busy} onClick={() => remove(a.id)}>remove</button> : null}
        </p>
      ))}

      {canOperate ? (
        <div className="ret-evidence__upload">
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional) — e.g. broken lid, front" className="ret-evidence__cap" />
          <input
            ref={fileRef} type="file" accept="image/*,video/*" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
          />
          {busy ? <span className="ff-refreshing">uploading…</span> : null}
          {pending && !busy ? <span className="ff-refreshing">refreshing…</span> : null}
          {err ? <span className="ff-error">{err}</span> : null}
          <span className="om-field__hint">Attach the photos / video a customer emailed in. Images can be opened & zoomed.</span>
        </div>
      ) : null}

      {lightbox !== null && images[lightbox] ? (
        <div className="ret-lb" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          <button type="button" className="ret-lb__close" aria-label="Close" onClick={() => setLightbox(null)}>×</button>
          {images.length > 1 ? <button type="button" className="ret-lb__nav ret-lb__nav--prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); step(-1); }}>‹</button> : null}
          <figure className="ret-lb__fig" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[lightbox].url} alt={images[lightbox].caption ?? "Return evidence"} />
            <figcaption className="ret-lb__cap">
              {images[lightbox].caption ? `${images[lightbox].caption} · ` : ""}{lightbox + 1} / {images.length}
              <a href={images[lightbox].url} target="_blank" rel="noopener noreferrer" className="text-link" style={{ marginLeft: 10 }}>open original</a>
            </figcaption>
          </figure>
          {images.length > 1 ? <button type="button" className="ret-lb__nav ret-lb__nav--next" aria-label="Next" onClick={(e) => { e.stopPropagation(); step(1); }}>›</button> : null}
        </div>
      ) : null}
    </section>
  );
}
