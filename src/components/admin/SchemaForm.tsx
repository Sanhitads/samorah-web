"use client";

import type { FieldDef } from "@/lib/cms/sectionSchema";
import { isFieldVisible } from "@/lib/cms/sectionSchema";

export interface MediaOption { id: string; url: string; title: string }

/**
 * Schema-driven form (review points 1·2·3·9) — renders an editor from a field
 * schema, so ANY section (or future page block) gets its form automatically. Honours
 * conditional visibility (showIf), field validation (length/pattern/url shown
 * inline), and repeatable blocks (add/remove/reorder). Values are a flat object.
 */
export function SchemaForm({ fields, values, media, onChange }: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  media: MediaOption[];
  onChange: (key: string, value: unknown) => void;
}) {
  if (!fields.length) return <p className="admin__muted" style={{ padding: "4px 0" }}>Content for this section comes from its catalogue — no inline fields yet.</p>;
  return (
    <div className="cfg-grid">
      {fields.map((f) => <FieldControl key={f.key} f={f} value={values[f.key]} content={values} media={media} onChange={(v) => onChange(f.key, v)} />)}
    </div>
  );
}

function inlineError(f: FieldDef, v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  if (f.maxLength && v.length > f.maxLength) return `${v.length}/${f.maxLength} — too long`;
  if (f.minLength && v.length < f.minLength) return `min ${f.minLength} chars`;
  if (f.pattern && !new RegExp(f.pattern).test(v)) return f.patternMessage ?? "invalid format";
  if (f.type === "url" && !(/^https?:\/\//.test(v) || v.startsWith("/") || v.startsWith("#") || v.startsWith("gradient:"))) return "must be a URL, path, or anchor";
  return null;
}

function move<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir; if (j < 0 || j >= arr.length) return arr;
  const n = [...arr]; [n[i], n[j]] = [n[j], n[i]]; return n;
}

function FieldControl({ f, value, content, media, onChange }: { f: FieldDef; value: unknown; content: Record<string, unknown>; media: MediaOption[]; onChange: (v: unknown) => void }) {
  if (!isFieldVisible(f, content)) return null;
  const id = `f-${f.key}`;
  const str = value === undefined || value === null ? "" : String(value);
  const err = inlineError(f, value);
  const counter = f.maxLength && typeof value === "string" ? `${value.length}/${f.maxLength}` : null;

  // Repeatable blocks (point 3).
  if (f.type === "blocks") {
    const blocks = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    const setBlock = (i: number, key: string, v: unknown) => onChange(blocks.map((b, j) => (j === i ? { ...b, [key]: v } : b)));
    return (
      <div className="cfg-field" data-wide="1">
        <span>{f.label}{f.required ? " *" : ""} <span className="admin__muted">({blocks.length}{f.maxBlocks ? `/${f.maxBlocks}` : ""})</span></span>
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
              {(f.blockFields ?? []).map((bf) => <FieldControl key={bf.key} f={bf} value={b[bf.key]} content={b} media={media} onChange={(v) => setBlock(i, bf.key, v)} />)}
            </div>
          </div>
        ))}
        <button type="button" className="ff-btn" disabled={!!f.maxBlocks && blocks.length >= f.maxBlocks} onClick={() => onChange([...blocks, {}])}>+ Add {f.blockLabel ?? "item"}</button>
      </div>
    );
  }

  return (
    <label className="cfg-field" data-wide={f.type === "textarea" ? "1" : undefined}>
      <span>{f.label}{f.required ? " *" : ""}{counter ? <span className="sf-counter" data-over={err ? "1" : "0"}> {counter}</span> : null}</span>
      {f.type === "textarea" ? (
        <textarea id={id} rows={2} value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
      ) : f.type === "boolean" ? (
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      ) : f.type === "number" ? (
        <input id={id} type="number" value={str} min={f.min} max={f.max} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
      ) : f.type === "select" || f.type === "align" ? (
        <select id={id} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : f.type === "color" ? (
        <input id={id} type="text" value={str} onChange={(e) => onChange(e.target.value)} placeholder="#f5f2ed" />
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
        <input id={id} type="text" value={str} maxLength={f.maxLength} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
      )}
      {err ? <small className="sf-err">{err}</small> : f.help ? <small className="admin__muted">{f.help}</small> : null}
    </label>
  );
}
