"use client";

import type { FieldDef } from "@/lib/cms/sectionSchema";
import { isFieldVisible } from "@/lib/cms/sectionSchema";

export interface MediaOption { id: string; url: string; title: string }
export type EntityOptions = Record<string, { id: string; label: string }[]>;

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
      {fields.map((f) => <FieldControl key={f.key} f={f} value={values[f.key]} content={values} media={media} entities={entities} onChange={(v) => onChange(f.key, v)} />)}
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

function FieldControl({ f, value, content, media, entities, onChange }: { f: FieldDef; value: unknown; content: Record<string, unknown>; media: MediaOption[]; entities: EntityOptions; onChange: (v: unknown) => void }) {
  if (!isFieldVisible(f, content)) return null;
  const id = `f-${f.key}`;
  const str = value === undefined || value === null ? "" : String(value);
  const err = inlineError(f, value);
  const counter = f.maxLength && typeof value === "string" ? `${value.length}/${f.maxLength}` : null;
  const helpText = f.description || f.help || (f.recommendedSize ? `Recommended: ${f.recommendedSize}` : "");

  // Nested repeatable blocks (points 1, 3).
  if (f.type === "blocks") {
    const blocks = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    const setBlock = (i: number, key: string, v: unknown) => onChange(blocks.map((b, j) => (j === i ? { ...b, [key]: v } : b)));
    return (
      <div className="cfg-field" data-wide="1" title={f.tooltip}>
        <span>{f.label}{f.required ? " *" : ""} <span className="admin__muted">({blocks.length}{f.maxBlocks ? `/${f.maxBlocks}` : ""})</span></span>
        {f.description ? <small className="admin__muted">{f.description}</small> : null}
        {blocks.map((b, i) => (
          <div key={i} className="sf-block">
            <div className="sf-block__head">
              <span className="admin__muted">{f.blockLabel ?? "Item"} {i + 1}</span>
              <span className="ff-actions">
                <button type="button" className="ff-btn" disabled={i === 0} onClick={() => onChange(move(blocks, i, -1))}>↑</button>
                <button type="button" className="ff-btn" disabled={i === blocks.length - 1} onClick={() => onChange(move(blocks, i, 1))}>↓</button>
                <button type="button" className="ff-btn ff-btn--danger" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>×</button>
              </span>
            </div>
            <div className="cfg-grid">
              {(f.blockFields ?? []).map((bf) => <FieldControl key={bf.key} f={bf} value={b[bf.key]} content={b} media={media} entities={entities} onChange={(v) => setBlock(i, bf.key, v)} />)}
            </div>
          </div>
        ))}
        <button type="button" className="ff-btn" disabled={!!f.maxBlocks && blocks.length >= f.maxBlocks} onClick={() => onChange([...blocks, {}])}>+ Add {f.blockLabel ?? "item"}</button>
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
      {f.type === "textarea" || f.type === "richtext" ? (
        <textarea id={id} rows={f.type === "richtext" ? 4 : 2} value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
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
      ) : f.type === "color" || f.type === "icon" ? (
        <input id={id} type="text" value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.type === "color" ? "#f5f2ed" : f.placeholder ?? "icon name / emoji"} />
      ) : f.type === "media" ? (
        <span className="sf-media">
          <input id={id} type="text" value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? "Media URL / gradient:name"} />
          {media.length ? (
            <select value="" onChange={(e) => { if (e.target.value) onChange(e.target.value); }} title="Pick from Media Library">
              <option value="">Library…</option>
              {media.map((m) => <option key={m.id} value={m.url}>{m.title || m.url.split("/").pop()}</option>)}
            </select>
          ) : null}
        </span>
      ) : (
        <input id={id} type={f.type === "url" ? "text" : "text"} value={str} maxLength={f.maxLength} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
      )}
      {err ? <small className="sf-err">{err}</small> : helpText ? <small className="admin__muted">{helpText}</small> : null}
    </label>
  );
}
