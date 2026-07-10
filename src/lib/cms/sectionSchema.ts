/**
 * Section schema DSL (review points 3·9) — the typed field description each section
 * type declares, from which the admin AUTO-GENERATES its editor (no hardcoded forms)
 * and against which content is validated. Deliberately RESOURCE-AGNOSTIC: the same
 * DSL will drive a future Page Builder (About / Journal / Landing) — the homepage is
 * just its first consumer (point 10).
 */

export type FieldType = "text" | "textarea" | "url" | "media" | "boolean" | "select" | "number" | "align" | "color";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default?: unknown;
  required?: boolean;
  options?: { value: string; label: string }[]; // select / align
  help?: string;
  placeholder?: string;
}

export interface SectionSchema {
  type: string;
  label: string;
  note: string;
  /** Editable fields. Empty ⇒ this section's content is sourced elsewhere (list data). */
  fields: FieldDef[];
  /** True when the section renders list data from its own config/entities (not fields). */
  sourced?: boolean;
}

/** Static defaults declared by the schema (field.default). */
export function schemaDefaults(schema: SectionSchema): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of schema.fields) if (f.default !== undefined) o[f.key] = f.default;
  return o;
}

/**
 * Resolve a section's effective content: schema defaults, then config-derived
 * defaults (keeps unedited sections identical to today), then the saved DB settings
 * (what the editor changed). Editing any field persists it → content lives in the DB.
 */
export function resolveContent(schema: SectionSchema, configDefaults: Record<string, unknown>, settings: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...schemaDefaults(schema), ...configDefaults, ...(settings ?? {}) };
}

/** Validate resolved content against the schema — returns human-readable errors. */
export function validateContent(schema: SectionSchema, content: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const f of schema.fields) {
    if (!f.required) continue;
    const v = content[f.key];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) errors.push(`${schema.label}: "${f.label}" is required`);
  }
  return errors;
}

export const ALIGN_OPTIONS = [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }];
