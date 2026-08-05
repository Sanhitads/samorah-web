"use client";

import { useState } from "react";
import type { MediaOption } from "./SchemaForm";
import type { EffectiveSeo } from "@/services/seoRedirectService";
import { postSeo } from "./seo/postSeo";
import { draftPreview } from "@/lib/seo/effectivePreview";
import { RobotsControls, OgImageField, CharCount, SeoPreview, ProvenanceBadge } from "./seo/SeoPrimitives";

/**
 * Page SEO panel — edits the DB SEO override for a composable page's live path right inside its builder.
 * It shares the SAME backend, validation, confirmation semantics and canonical effective/provenance
 * source as /admin/seo (no parallel SEO logic): saving goes through the shared `postSeo` confirmation
 * loop; the preview overlays unsaved edits on the canonical `getEffectiveSeo` baseline (Draft Preview),
 * which is distinct from the Resolved (effective) provenance shown alongside. JSON-LD is preserved.
 */
export type PageSeo = { title: string; description: string; ogImage: string; canonical: string; robots: string; structuredData: string };

const ORG_TEMPLATE = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Samorah — Handmade Scented Candles",
  description: "Slow-crafted luxury scented candles inspired by ritual, silence and timeless warmth.",
}, null, 2);

export function PageSeoPanel({ path, label, initial, origin }: {
  path: string; label: string; initial: PageSeo; origin: string; media?: MediaOption[];
}) {
  const [open, setOpen] = useState(false);
  const [seo, setSeo] = useState<PageSeo>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [effective, setEffective] = useState<EffectiveSeo | null>(null);

  const set = (k: keyof PageSeo, v: string) => { setSeo((s) => ({ ...s, [k]: v })); setMsg(null); };

  const loadEffective = async () => {
    try { const r = await fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seo.effective", path }) }); const d = await r.json(); setEffective(d.effective ?? null); } catch { /* preview falls back to draft only */ }
  };
  const toggle = () => { const next = !open; setOpen(next); if (next && !effective) loadEffective(); };

  const save = async () => {
    if (seo.structuredData.trim()) { try { JSON.parse(seo.structuredData); } catch { setMsg({ tone: "err", text: "Structured data must be valid JSON." }); return; } }
    setBusy(true); setMsg(null);
    const { ok, data } = await postSeo({ action: "seo.save", seo: { path, ...seo } }, (msgs) => window.confirm(`${msgs.join("\n\n")}\n\nProceed anyway?`));
    setBusy(false);
    if (ok) { const warn = data.analysis?.warnings?.[0]; setMsg({ tone: warn ? "warn" : "ok", text: warn ? `Saved. Note: ${warn}` : "SEO saved — live within seconds." }); loadEffective(); }
    else if (!data.cancelled) setMsg({ tone: "err", text: data.error ?? data.reason ?? "Failed to save" });
  };

  const preview = draftPreview(effective, seo);

  return (
    <div className="hp-seo">
      <button type="button" className="hp-seo__toggle" aria-expanded={open} onClick={toggle}>
        <span>{open ? "▾" : "▸"} Page SEO &amp; social preview</span>
        <span className="admin__muted">{seo.title || seo.description || seo.ogImage ? "customised" : "using defaults"} · {path}</span>
      </button>
      {open ? (
        <div className="hp-seo__body">
          <div className="hp-seo__form">
            <label className="cfg-field"><span>Meta title <CharCount value={seo.title} kind="title" /></span>
              <input value={seo.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder={`${label} · Samorah`} /></label>
            <label className="cfg-field"><span>Meta description <CharCount value={seo.description} kind="description" /></span>
              <textarea rows={2} value={seo.description} onChange={(e) => set("description", e.target.value)} placeholder="Shown under the title in search results" /></label>
            <div className="cfg-field"><span>OG / social image</span>
              <OgImageField value={seo.ogImage} onChange={(url) => set("ogImage", url)} /></div>
            <label className="cfg-field"><span>Canonical URL</span><input value={seo.canonical} onChange={(e) => set("canonical", e.target.value)} placeholder={`${origin}${path === "/" ? "" : path}`} /></label>
            <RobotsControls value={seo.robots} onChange={(r) => set("robots", r)} />
            <label className="cfg-field"><span>Structured data (JSON-LD) <span className="admin__muted">— optional, advanced</span></span>
              <textarea rows={4} className="hp-seo__jsonld" value={seo.structuredData} onChange={(e) => set("structuredData", e.target.value)} placeholder='{ "@context": "https://schema.org", "@type": "WebPage", … }' spellCheck={false} />
              <span className="cfg-hint">Rendered as a &lt;script type=&quot;application/ld+json&quot;&gt; on this page, on top of the automatic Organization + WebSite schema. <button type="button" className="ff-btn ff-btn--mini" onClick={() => set("structuredData", ORG_TEMPLATE)}>Insert WebPage template</button></span></label>
            <div className="cfg-actions">
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save SEO"}</button>
              {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
            </div>
          </div>

          <div className="hp-seo__previews">
            <SeoPreview preview={preview} origin={origin} path={path} heading="Draft preview" note="your unsaved edits over the resolved baseline" />
            {effective ? (
              <div className="seo-resolved-strip">
                <span className="admin__muted">Resolved baseline:</span>
                <span>Title <ProvenanceBadge f={effective.title} /></span>
                <span>Description <ProvenanceBadge f={effective.description} /></span>
                <span>Canonical <ProvenanceBadge f={effective.canonical} /></span>
                <span>OG <ProvenanceBadge f={effective.ogImage} /></span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
