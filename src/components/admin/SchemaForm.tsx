"use client";

import { useState } from "react";
import type { FieldDef } from "@/lib/cms/sectionSchema";
import { isFieldVisible } from "@/lib/cms/sectionSchema";
import { gradientClass, isColorValue } from "@/lib/product";
import { RichTextField } from "./RichTextField";
import { MediaPicker } from "./MediaPicker";

export interface MediaOption { id: string; url: string; title: string }

/** A hosted-video URL (MP4/WebM/etc.) — rendered as a <video> thumbnail rather than an <img>. */
const isVideoUrl = (v: string) => /^https?:\/\//.test(v) && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(v);
export type EntityOption = { id: string; label: string; data?: Record<string, unknown> };
export type EntityOptions = Record<string, EntityOption[]>;

// Gradient tokens available as placeholders until Cloudinary photography lands. A "gradient:<token>"
// value renders the matching CSS gradient on the storefront (see gradientClass).
const GRADIENT_PRESETS = [
  "grad-chai", "grad-wild", "grad-amethyst", "grad-nature", "grad-air", "grad-bundle", "grad-story",
  "grad-smoke", "grad-blush", "grad-crimson", "grad-citrine", "grad-gajar", "grad-modak", "grad-dark",
  "grad-hero1", "grad-hero2", "grad-atm1", "grad-atm2", "grad-atm3", "grad-atm4", "grad-atm5", "grad-atm6",
];

/**
 * Schema-driven form — renders an editor from a field schema, so ANY section, page
 * block or email block gets its form automatically. Honours conditional visibility
 * (showIf), field validation (length/pattern/url/email inline), editor help
 * (description/tooltip/recommended size), references (store IDs), and nested
 * repeatable blocks (add/remove/reorder). Values are a flat object.
 */
export function SchemaForm({ fields, values, media, entities = {}, onChange }: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  media: MediaOption[];
  entities?: EntityOptions;
  onChange: (key: string, value: unknown) => void;
}) {
  if (!fields.length) return <p className="admin__muted" style={{ padding: "4px 0" }}>Content for this section comes from its catalogue — no inline fields yet.</p>;
  return (
    <div className="cfg-grid">
      {fields.map((f) => <FieldControl key={f.key} f={f} value={values[f.key]} content={values} media={media} entities={entities} onChange={(v) => onChange(f.key, v)} onSibling={onChange} />)}
    </div>
  );
}

function inlineError(f: FieldDef, v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  if (f.maxLength && v.length > f.maxLength) return `${v.length}/${f.maxLength} — too long`;
  if (f.minLength && v.length < f.minLength) return `min ${f.minLength} chars`;
  if (f.pattern && !new RegExp(f.pattern).test(v)) return f.patternMessage ?? "invalid format";
  if (f.type === "url" && !(/^https?:\/\//.test(v) || v.startsWith("/") || v.startsWith("#") || v.startsWith("gradient:"))) return "must be a URL, path, or anchor";
  if (f.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "invalid email";
  return null;
}

function move<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir; if (j < 0 || j >= arr.length) return arr;
  const n = [...arr]; [n[i], n[j]] = [n[j], n[i]]; return n;
}

function FieldControl({ f, value, content, media, entities, onChange, onSibling }: { f: FieldDef; value: unknown; content: Record<string, unknown>; media: MediaOption[]; entities: EntityOptions; onChange: (v: unknown) => void; onSibling?: (key: string, value: unknown) => void }) {
  // Hooks must run every render (before any early return) — used by the media uploader below.
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const upload = async (file: File) => {
    setUploading(true); setUpErr("");
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "homepage");
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const d = await res.json(); setUploading(false);
      if (!res.ok || d.ok === false) { setUpErr(d.error ?? d.reason ?? "Upload failed"); return; }
      if (d.url) onChange(d.url);
      if (d.warning) setUpErr(d.warning); // uploaded, but flagged (e.g. too small)
    } catch { setUploading(false); setUpErr("Upload failed"); }
  };
  if (!isFieldVisible(f, content)) return null;
  const id = `f-${f.key}`;
  const str = value === undefined || value === null ? "" : String(value);
  const err = inlineError(f, value);
  const counter = f.maxLength && typeof value === "string" ? `${value.length}/${f.maxLength}` : null;
  const helpText = f.description || f.help || (f.recommendedSize ? `Recommended: ${f.recommendedSize}` : "");
  // Alt-text validation (Phase 5 · point 22): a text field bound to a sibling image via `altFor`.
  const altImg = f.altFor ? content[f.altFor] : undefined;
  const altImgReal = typeof altImg === "string" && /^https?:\/\//.test(altImg);
  const decorative = f.altFor ? !!content[`${f.altFor}__decorative`] : false;
  const altMissing = !!f.altFor && altImgReal && !str.trim() && !decorative;

  // Nested repeatable blocks (points 1, 3).
  if (f.type === "blocks") {
    const blocks = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    const setBlock = (i: number, key: string, v: unknown) => onChange(blocks.map((b, j) => (j === i ? { ...b, [key]: v } : b)));
    const src = f.blockSource;
    const srcOpts = src ? (entities[src.entity] ?? []) : [];
    // "Pull from product": merge the selected entity's mapped data into the block (overridable after).
    const pull = (i: number, entityId: string) => {
      const opt = srcOpts.find((o) => o.id === entityId);
      const data = (opt?.data ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = { ...blocks[i], _sourceId: entityId };
      for (const [blockField, dataKey] of Object.entries(src!.map)) if (data[dataKey] !== undefined && data[dataKey] !== "") patch[blockField] = data[dataKey];
      onChange(blocks.map((b, j) => (j === i ? patch : b)));
    };
    return (
      <div className="cfg-field" data-wide="1" title={f.tooltip}>
        <span>{f.label}{f.required ? " *" : ""} <span className="admin__muted">({blocks.length}{f.maxBlocks ? `/${f.maxBlocks}` : ""})</span></span>
        {f.description ? <small className="admin__muted">{f.description}</small> : null}
        {blocks.map((b, i) => (
          <div key={i} className="sf-block">
            <div className="sf-block__head">
              <span className="admin__muted">{(f.blockVariants ? (f.blockVariants.find((bv) => bv.key === b._type)?.label ?? "Block") : (f.blockLabel ?? "Item"))} {i + 1}</span>
              <span className="ff-actions">
                <button type="button" className="ff-btn" disabled={i === 0} onClick={() => onChange(move(blocks, i, -1))}>↑</button>
                <button type="button" className="ff-btn" disabled={i === blocks.length - 1} onClick={() => onChange(move(blocks, i, 1))}>↓</button>
                <button type="button" className="ff-btn ff-btn--danger" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>×</button>
              </span>
            </div>
            {src && srcOpts.length ? (
              <label className="sf-pull">
                <span>{src.label ?? "Pull from a product"} <span className="admin__muted">(fills the fields — then edit freely)</span></span>
                <select value={String(b._sourceId ?? "")} onChange={(e) => { if (e.target.value) pull(i, e.target.value); else setBlock(i, "_sourceId", ""); }}>
                  <option value="">— none (type your own) —</option>
                  {srcOpts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
            ) : null}
            <div className="cfg-grid">
              {(f.blockVariants ? (f.blockVariants.find((bv) => bv.key === b._type)?.fields ?? []) : (f.blockFields ?? [])).map((bf) => (
                <FieldControl key={bf.key} f={bf} value={b[bf.key]} content={b} media={media} entities={entities} onChange={(v) => setBlock(i, bf.key, v)} onSibling={(k, v) => setBlock(i, k, v)} />
              ))}
            </div>
          </div>
        ))}
        {f.blockVariants ? (
          <span className="sf-addvariants">
            {f.blockVariants.map((bv) => (
              <button key={bv.key} type="button" className="ff-btn ff-btn--mini" disabled={!!f.maxBlocks && blocks.length >= f.maxBlocks} onClick={() => onChange([...blocks, { _type: bv.key }])}>+ Add {bv.label}</button>
            ))}
          </span>
        ) : (
          <button type="button" className="ff-btn" disabled={!!f.maxBlocks && blocks.length >= f.maxBlocks} onClick={() => onChange([...blocks, {}])}>+ Add {f.blockLabel ?? "item"}</button>
        )}
      </div>
    );
  }

  // Reference (point 5) — stores { entity, id }, not a slug.
  if (f.type === "reference") {
    const ref = (value && typeof value === "object" ? value : {}) as { entity?: string; id?: string };
    const opts = entities[f.refEntity ?? ""] ?? [];
    return (
      <label className="cfg-field" title={f.tooltip}>
        <span>{f.label}{f.required ? " *" : ""} <span className="admin__muted">({f.refEntity})</span></span>
        <select value={ref.id ?? ""} onChange={(e) => onChange(e.target.value ? { entity: f.refEntity, id: e.target.value } : undefined)}>
          <option value="">— none —</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {helpText ? <small className="admin__muted">{helpText}</small> : null}
      </label>
    );
  }

  const wide = f.type === "textarea" || f.type === "richtext";
  return (
    <label className="cfg-field" data-wide={wide ? "1" : undefined} title={f.tooltip}>
      <span>{f.label}{f.required ? " *" : ""}{counter ? <span className="sf-counter" data-over={err ? "1" : "0"}> {counter}</span> : null}</span>
      {f.type === "richtext" ? (
        <RichTextField value={str} onChange={(html) => onChange(html)} placeholder={f.placeholder} />
      ) : f.type === "textarea" ? (
        <textarea id={id} rows={2} value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
      ) : f.type === "boolean" ? (
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      ) : f.type === "number" ? (
        <input id={id} type="number" value={str} min={f.min} max={f.max} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
      ) : f.type === "date" || f.type === "datetime" ? (
        <input id={id} type={f.type === "date" ? "date" : "datetime-local"} value={str} onChange={(e) => onChange(e.target.value)} />
      ) : f.type === "email" ? (
        <input id={id} type="email" value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? "name@example.com"} />
      ) : f.type === "select" || f.type === "align" ? (
        <select id={id} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : f.type === "color" ? (
        <span className="sf-color">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(str) ? str : "#cccccc"} onChange={(e) => onChange(e.target.value)} aria-label={`${f.label} colour`} />
          <input id={id} type="text" value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? "#f5f2ed"} />
        </span>
      ) : f.type === "icon" ? (
        <input id={id} type="text" value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? "icon name / emoji"} />
      ) : f.type === "media" ? (
        <span className="sf-media">
          <span className="sf-media__row">
            {isVideoUrl(str) ? (
              <video className="sf-media__thumb" src={str} muted playsInline aria-hidden="true" />
            ) : /^https?:\/\//.test(str) ? (
              /* eslint-disable-next-line @next/next/no-img-element */ <img src={str} alt="" className="sf-media__thumb" />
            ) : str.startsWith("gradient:") ? (
              <span className={`sf-media__thumb ${gradientClass(str) ?? ""}`} aria-hidden="true" />
            ) : isColorValue(str) ? (
              <span className="sf-media__thumb" style={{ background: str }} aria-hidden="true" />
            ) : (
              <span className="sf-media__thumb sf-media__thumb--empty" aria-hidden="true">—</span>
            )}
            <input id={id} type="text" value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? "Media URL / gradient / #colour"} />
            <button type="button" className="ff-btn ff-btn--mini" onClick={() => setPickerOpen(true)}>Browse</button>
            <label className={`ff-btn ff-btn--mini${uploading ? " is-disabled" : ""}`} style={{ cursor: uploading ? "default" : "pointer" }}>
              {uploading ? "Uploading…" : "⬆ Upload"}
              <input type="file" accept={f.allowedMime?.length ? f.allowedMime.join(",") : "image/*"} hidden disabled={uploading} onChange={(e) => { const fl = e.target.files?.[0]; if (fl) upload(fl); e.target.value = ""; }} />
            </label>
          </span>
          {pickerOpen ? (
            <MediaPicker
              open={pickerOpen}
              kind={f.allowedMime?.some((m) => m.startsWith("video/")) ? "video" : "image"}
              allowCrop={!f.allowedMime?.some((m) => m.startsWith("video/"))}
              onSelect={(url, focal) => { onChange(url); onSibling?.(`${f.key}__focal`, focal ?? ""); }}
              onClose={() => setPickerOpen(false)}
            />
          ) : null}
          {/* Gradient / solid-colour placeholders + image library — not shown for video-only fields. */}
          {f.allowedMime?.some((m) => m.startsWith("video/")) ? null : (
            <span className="sf-media__row">
              <select value="" onChange={(e) => { if (e.target.value) onChange(`gradient:${e.target.value}`); }} title="Use a gradient placeholder">
                <option value="">Gradient…</option>
                {GRADIENT_PRESETS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <input type="color" value={isColorValue(str) ? str : "#caa46a"} onChange={(e) => onChange(e.target.value)} title="Pick a solid colour" aria-label={`${f.label} colour`} />
              {media.length ? (
                <select value="" onChange={(e) => { if (e.target.value) onChange(e.target.value); }} title="Pick from Media Library">
                  <option value="">Library…</option>
                  {media.map((m) => <option key={m.id} value={m.url}>{m.title || m.url.split("/").pop()}</option>)}
                </select>
              ) : null}
            </span>
          )}
          {upErr ? <small className="sf-err">{upErr}</small> : null}
        </span>
      ) : (
        <input id={id} type={f.type === "url" ? "text" : "text"} value={str} maxLength={f.maxLength} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
      )}
      {err ? <small className="sf-err">{err}</small> : helpText ? <small className="admin__muted">{helpText}</small> : null}
      {f.altFor ? (
        <label className="sf-decorative"><input type="checkbox" checked={decorative} onChange={(e) => onSibling?.(`${f.altFor}__decorative`, e.target.checked)} /> Decorative image (no alt needed)</label>
      ) : null}
      {altMissing ? <small className="sf-warn">⚠ Describe this image for screen readers, or mark it decorative</small> : null}
    </label>
  );
}
