"use client";

/**
 * Small, shared SEO editing primitives (SEO Phase 2 · point 22). Deliberately NOT a universal editor —
 * each is a narrow, reusable piece consumed by both /admin/seo (SeoRedirectsManager) and PageSeoPanel:
 * provenance badge, robots controls, OG-image field (MediaPicker), length-guidance hint, and the
 * SERP + social preview cards. Validation/guidance come from the canonical @/lib/seo helpers; preview
 * values come from the effective baseline + draft overlay (draftPreview) — never a second resolver.
 */
import { useId, useState } from "react";
import type { EffectiveField } from "@/services/seoRedirectService";
import { parseRobots, buildRobots, titleGuidance, descriptionGuidance } from "@/lib/seo/seoValidation";
import type { PreviewSeo } from "@/lib/seo/effectivePreview";
import { MediaPicker } from "../MediaPicker";
import type { MediaOption } from "../SchemaForm";

const PROV_LABEL: Record<string, string> = { overridden: "Overridden", "site-default": "Site default", "inherited-page": "Inherited from page/entity", "not-overridden": "Not overridden" };
export function ProvenanceBadge({ f }: { f: EffectiveField }) {
  return <span className={`seo-prov seo-prov--${f.provenance}`}>{PROV_LABEL[f.provenance] ?? f.provenance}</span>;
}

/** Structured Index/Follow controls ↔ the canonical robots string (preserves advanced directives). */
export function RobotsControls({ value, onChange }: { value: string; onChange: (robots: string) => void }) {
  const id = useId();
  const c = parseRobots(value);
  return (
    <div className="seo-robots">
      <fieldset className="cfg-field"><span>Search indexing</span>
        <div className="seo-radio">
          <label><input type="radio" name={`idx-${id}`} checked={c.index} onChange={() => onChange(buildRobots({ ...c, index: true }))} /> Index this page</label>
          <label><input type="radio" name={`idx-${id}`} checked={!c.index} onChange={() => onChange(buildRobots({ ...c, index: false }))} /> Do not index</label>
        </div>
      </fieldset>
      <fieldset className="cfg-field"><span>Link crawling</span>
        <div className="seo-radio">
          <label><input type="radio" name={`fol-${id}`} checked={c.follow} onChange={() => onChange(buildRobots({ ...c, follow: true }))} /> Follow links</label>
          <label><input type="radio" name={`fol-${id}`} checked={!c.follow} onChange={() => onChange(buildRobots({ ...c, follow: false }))} /> Do not follow</label>
        </div>
      </fieldset>
    </div>
  );
}

/** OG image via the canonical MediaPicker (Choose / thumbnail / Replace / Remove), storing the URL —
 *  consistent with the existing og_image column. A custom URL remains available as an advanced fallback. */
export function OgImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const isImg = /^https?:\/\//.test(value);
  return (
    <div className="seo-og-field">
      {isImg ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img className="seo-og-field__thumb" src={value} alt="" />
      ) : <div className="seo-og-field__thumb seo-og-field__thumb--empty">No image</div>}
      <div className="seo-og-field__controls">
        <div className="seo-og-field__btns">
          <button type="button" className="ff-btn ff-btn--sm" onClick={() => setOpen(true)}>{isImg ? "Replace" : "Choose media"}</button>
          {value ? <button type="button" className="ff-btn ff-btn--sm ff-btn--ghost" onClick={() => onChange("")}>Remove</button> : null}
        </div>
        <input className="seo-og-field__url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="…or paste a custom URL (advanced)" />
      </div>
      <MediaPicker open={open} kind="image" onSelect={(url) => { onChange(url); setOpen(false); }} onClose={() => setOpen(false)} />
    </div>
  );
}

export function CharCount({ value, kind }: { value: string; kind: "title" | "description" }) {
  const g = kind === "title" ? titleGuidance(value.length) : descriptionGuidance(value.length);
  return <span className="admin__muted">{value.length} chars{g ? ` · ${g.text}` : ""}</span>;
}

const domainOf = (origin: string) => origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
const previewTitle = (t: string) => t || "Untitled page";
const previewDesc = (d: string) => d || "No description — search engines will choose an excerpt.";

/** Google search-result card (effective baseline + unsaved draft overlay). */
export function SerpCard({ preview, origin, path }: { preview: PreviewSeo; origin: string; path: string }) {
  const domain = domainOf(origin);
  const crumb = `${domain}${path && path !== "/" ? path : ""}`;
  return (
    <div className="seo-serp">
      <div className="seo-serp__crumbs">{crumb.split("/").filter(Boolean).join(" › ") || domain}</div>
      <div className="seo-serp__title">{previewTitle(preview.title)}</div>
      <div className="seo-serp__desc">{previewDesc(preview.description)}</div>
    </div>
  );
}

/** Social/OG share card (effective baseline + unsaved draft overlay). */
export function SocialCard({ preview, origin }: { preview: PreviewSeo; origin: string }) {
  return (
    <div className="seo-og">
      {/^https?:\/\//.test(preview.ogImage) ? (
        /* eslint-disable-next-line @next/next/no-img-element */ <img className="seo-og__img" src={preview.ogImage} alt="" />
      ) : <div className="seo-og__img seo-og__img--empty">No OG image — add one for rich link cards</div>}
      <div className="seo-og__body">
        <span className="seo-og__domain">{domainOf(origin)}</span>
        <span className="seo-og__title">{previewTitle(preview.title)}</span>
        <span className="seo-og__desc">{previewDesc(preview.description)}</span>
      </div>
    </div>
  );
}

/** Both preview cards together (used by PageSeoPanel). */
export function SeoPreview({ preview, origin, path, heading = "Draft preview", note }: { preview: PreviewSeo; origin: string; path: string; heading?: string; note?: string }) {
  return (
    <div className="seo-preview">
      <p className="seo-preview__label">{heading}{note ? <span className="admin__muted"> — {note}</span> : null}</p>
      <div className="seo-preview__cards">
        <div><p className="admin__muted seo-preview__cap">Google result</p><SerpCard preview={preview} origin={origin} path={path} /></div>
        <div><p className="admin__muted seo-preview__cap">Social share (OG)</p><SocialCard preview={preview} origin={origin} /></div>
      </div>
      <p className="cfg-hint">Search engines may rewrite titles and descriptions — this is a guide, not a guarantee.</p>
    </div>
  );
}
