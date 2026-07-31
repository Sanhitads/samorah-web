"use client";

import { useState } from "react";
import type { MediaOption } from "./SchemaForm";

/**
 * Page SEO panel (Phase 5 · point 24) — edits the DB SEO override for a composable page's live path
 * (`/`, `/about`, `/journal`) right inside its builder, with a live Google SERP + social (OG) preview.
 * It layers over the global SEO defaults and is read by the page's `generateMetadata` via
 * `withRouteSeo(path)`. Saving posts to the existing `/api/admin/seo` endpoint (catalog.manage).
 */
export type PageSeo = { title: string; description: string; ogImage: string; canonical: string; robots: string };

export function PageSeoPanel({ path, label, initial, origin, media = [] }: {
  path: string; label: string; initial: PageSeo; origin: string; media?: MediaOption[];
}) {
  const [open, setOpen] = useState(false);
  const [seo, setSeo] = useState<PageSeo>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);

  const set = (k: keyof PageSeo, v: string) => { setSeo((s) => ({ ...s, [k]: v })); setMsg(null); };
  const displayTitle = seo.title || `${label} · Samorah`;
  const displayDesc = seo.description || "Slow-crafted luxury candles inspired by ritual, silence and timeless warmth.";
  const domain = origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const crumbUrl = `${domain}${path === "/" ? "" : path}`;

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seo.save", seo: { path, ...seo } }) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setMsg({ tone: "err", text: d.error ?? d.reason ?? "Failed to save" }); return; }
      setMsg({ tone: "ok", text: "SEO saved — live within seconds." });
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error" }); }
  };

  return (
    <div className="hp-seo">
      <button type="button" className="hp-seo__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{open ? "▾" : "▸"} Page SEO &amp; social preview</span>
        <span className="admin__muted">{seo.title || seo.description || seo.ogImage ? "customised" : "using defaults"} · {path}</span>
      </button>
      {open ? (
        <div className="hp-seo__body">
          <div className="hp-seo__form">
            <label className="cfg-field"><span>Meta title <span className="sf-counter" data-over={seo.title.length > 60 ? "1" : "0"}>{seo.title.length}/60</span></span>
              <input value={seo.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder={`${label} · Samorah`} /></label>
            <label className="cfg-field"><span>Meta description <span className="sf-counter" data-over={seo.description.length > 160 ? "1" : "0"}>{seo.description.length}/160</span></span>
              <textarea rows={2} value={seo.description} onChange={(e) => set("description", e.target.value)} placeholder="Shown under the title in search results" /></label>
            <label className="cfg-field"><span>OG / social image URL</span>
              <input value={seo.ogImage} onChange={(e) => set("ogImage", e.target.value)} placeholder="https://res.cloudinary.com/…" />
              {media.length ? (
                <select value="" onChange={(e) => { if (e.target.value) set("ogImage", e.target.value); }} title="Pick from Media Library">
                  <option value="">Library…</option>
                  {media.map((m) => <option key={m.id} value={m.url}>{m.title || m.url.split("/").pop()}</option>)}
                </select>
              ) : null}</label>
            <label className="cfg-field"><span>Canonical URL</span><input value={seo.canonical} onChange={(e) => set("canonical", e.target.value)} placeholder={`${origin}${path === "/" ? "" : path}`} /></label>
            <label className="cfg-field"><span>Robots</span>
              <select value={seo.robots} onChange={(e) => set("robots", e.target.value)}>
                <option value="">Index &amp; follow (default)</option>
                <option value="noindex,follow">noindex, follow</option>
                <option value="noindex,nofollow">noindex, nofollow</option>
                <option value="index,nofollow">index, nofollow</option>
              </select></label>
            <div className="cfg-actions">
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save SEO"}</button>
              {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
            </div>
          </div>

          <div className="hp-seo__previews">
            <div>
              <p className="admin__muted" style={{ marginBottom: 6, fontSize: 11 }}>Google result</p>
              <div className="seo-serp">
                <div className="seo-serp__crumbs">{domain}<span>›</span>{crumbUrl.split("/").slice(1).join(" › ")}</div>
                <div className="seo-serp__title">{displayTitle}</div>
                <div className="seo-serp__desc">{displayDesc}</div>
              </div>
            </div>
            <div>
              <p className="admin__muted" style={{ marginBottom: 6, fontSize: 11 }}>Social share (OG)</p>
              <div className="seo-og">
                {/^https?:\/\//.test(seo.ogImage) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */ <img className="seo-og__img" src={seo.ogImage} alt="" />
                ) : <div className="seo-og__img seo-og__img--empty">No OG image — add one for rich link cards</div>}
                <div className="seo-og__body">
                  <span className="seo-og__domain">{domain}</span>
                  <span className="seo-og__title">{displayTitle}</span>
                  <span className="seo-og__desc">{displayDesc}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
