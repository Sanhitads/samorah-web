"use client";

import type { FieldDef } from "@/lib/cms/sectionSchema";

export interface MediaOption { id: string; url: string; title: string }

/**
 * Schema-driven form (review points 3·9) — renders an editor from a field schema,
 * so ANY section (or future page-builder block) gets its form automatically. No
 * per-section hardcoded forms. Values are a flat settings object.
 */
export function SchemaForm({ fields, values, media, onChange }: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  media: MediaOption[];
  onChange: (key: string, value: unknown) => void;
}) {
  if (!fields.length) return <p className="admin__muted" style={{ padding: "4px 0" }}>Content for this section comes from its catalogue — no inline fields yet.</p>;
  const str = (k: string) => (values[k] === undefined || values[k] === null ? "" : String(values[k]));

  return (
    <div className="cfg-grid">
      {fields.map((f) => {
        const id = `f-${f.key}`;
        return (
          <label key={f.key} className="cfg-field" data-wide={f.type === "textarea" ? "1" : undefined}>
            <span>{f.label}{f.required ? " *" : ""}</span>
            {f.type === "textarea" ? (
              <textarea id={id} rows={2} value={str(f.key)} onChange={(e) => onChange(f.key, e.target.value)} placeholder={f.placeholder} />
            ) : f.type === "boolean" ? (
              <input id={id} type="checkbox" checked={!!values[f.key]} onChange={(e) => onChange(f.key, e.target.checked)} />
            ) : f.type === "number" ? (
              <input id={id} type="number" value={str(f.key)} onChange={(e) => onChange(f.key, e.target.value === "" ? undefined : Number(e.target.value))} />
            ) : f.type === "select" || f.type === "align" ? (
              <select id={id} value={str(f.key)} onChange={(e) => onChange(f.key, e.target.value)}>
                <option value="">—</option>
                {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === "color" ? (
              <input id={id} type="text" value={str(f.key)} onChange={(e) => onChange(f.key, e.target.value)} placeholder="#f5f2ed" />
            ) : f.type === "media" ? (
              <span className="sf-media">
                <input id={id} type="text" value={str(f.key)} onChange={(e) => onChange(f.key, e.target.value)} placeholder={f.placeholder ?? "Media URL / gradient:name"} />
                {media.length ? (
                  <select value="" onChange={(e) => { if (e.target.value) onChange(f.key, e.target.value); }} title="Pick from Media Library">
                    <option value="">Library…</option>
                    {media.map((m) => <option key={m.id} value={m.url}>{m.title || m.url.split("/").pop()}</option>)}
                  </select>
                ) : null}
              </span>
            ) : (
              <input id={id} type={f.type === "url" ? "text" : "text"} value={str(f.key)} onChange={(e) => onChange(f.key, e.target.value)} placeholder={f.placeholder} />
            )}
            {f.help ? <small className="admin__muted">{f.help}</small> : null}
          </label>
        );
      })}
    </div>
  );
}
