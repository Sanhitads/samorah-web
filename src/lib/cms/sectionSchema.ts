/**
 * Section schema DSL (review points 1·2·3·5·9) — the typed field description each
 * section type declares, from which the admin AUTO-GENERATES its editor (no hardcoded
 * forms) and against which content is validated. Resource-agnostic: the same DSL
 * drives the Composable Page Registry — Homepage is just its first consumer.
 *
 * Supports: field-level validation (length/pattern/range/url/image), conditional
 * fields (showIf), repeatable blocks (a field whose value is a list of sub-records),
 * and a per-schema cross-field validate() hook.
 */

export type FieldType = "text" | "textarea" | "url" | "media" | "boolean" | "select" | "number" | "align" | "color" | "blocks";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default?: unknown;
  required?: boolean;
  options?: { value: string; label: string }[]; // select / align
  help?: string;
  placeholder?: string;

  // ── field-level validation (point 1) ──
  maxLength?: number;
  minLength?: number;
  pattern?: string;          // regex source
  patternMessage?: string;   // shown when pattern fails
  min?: number;              // number
  max?: number;              // number
  minWidth?: number;         // image (enforced when dimensions are known)
  minHeight?: number;

  // ── conditional visibility (point 2) ── show this field only when the condition holds
  showIf?: { field: string; equals?: unknown; truthy?: boolean };

  // ── repeatable blocks (point 3) ── value is an array of records shaped by blockFields
  blockLabel?: string;       // e.g. "Testimonial"
  blockFields?: FieldDef[];
  minBlocks?: number;
  maxBlocks?: number;
}

export interface SectionSchema {
  type: string;
  label: string;
  note: string;
  fields: FieldDef[];
  sourced?: boolean;
  /** Cross-field rules beyond per-field checks (point 5). Returns error strings. */
  validate?: (content: Record<string, unknown>) => string[];
}

export function schemaDefaults(schema: SectionSchema): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of schema.fields) if (f.default !== undefined) o[f.key] = f.default;
  return o;
}

export function resolveContent(schema: SectionSchema, configDefaults: Record<string, unknown>, settings: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...schemaDefaults(schema), ...configDefaults, ...(settings ?? {}) };
}

/** Is a field currently visible given the other field values (point 2)? */
export function isFieldVisible(f: FieldDef, content: Record<string, unknown>): boolean {
  if (!f.showIf) return true;
  const v = content[f.showIf.field];
  if (f.showIf.truthy) return Boolean(v);
  if ("equals" in f.showIf) return v === f.showIf.equals;
  return Boolean(v);
}

const isBlankStr = (v: unknown) => typeof v === "string" && !v.trim();
const looksLikeUrl = (v: string) => /^https?:\/\//.test(v) || v.startsWith("/") || v.startsWith("#") || v.startsWith("gradient:");

/** Validate one field's value; returns error strings (prefixed by the caller). */
function validateField(f: FieldDef, content: Record<string, unknown>, prefix: string): string[] {
  const e: string[] = [];
  if (!isFieldVisible(f, content)) return e; // hidden ⇒ not validated (conditional-required, point 5)
  const v = content[f.key];

  if (f.required && (v === undefined || v === null || isBlankStr(v) || (f.type === "blocks" && (!Array.isArray(v) || !v.length)))) {
    e.push(`${prefix}"${f.label}" is required`); return e;
  }
  if (typeof v === "string" && v.trim()) {
    if (f.maxLength && v.length > f.maxLength) e.push(`${prefix}"${f.label}" must be ≤ ${f.maxLength} characters (is ${v.length})`);
    if (f.minLength && v.length < f.minLength) e.push(`${prefix}"${f.label}" must be ≥ ${f.minLength} characters`);
    if (f.pattern && !new RegExp(f.pattern).test(v)) e.push(`${prefix}${f.patternMessage ?? `"${f.label}" has an invalid format`}`);
    if (f.type === "url" && !looksLikeUrl(v)) e.push(`${prefix}"${f.label}" must be a URL, path, or anchor`);
  }
  if (f.type === "number" && typeof v === "number") {
    if (f.min !== undefined && v < f.min) e.push(`${prefix}"${f.label}" must be ≥ ${f.min}`);
    if (f.max !== undefined && v > f.max) e.push(`${prefix}"${f.label}" must be ≤ ${f.max}`);
  }
  // Image constraints — enforced when a dimensions sidecar (<key>__w/__h) is present.
  if (f.type === "media" && (f.minWidth || f.minHeight)) {
    const w = Number(content[`${f.key}__w`]); const h = Number(content[`${f.key}__h`]);
    if (w && f.minWidth && w < f.minWidth) e.push(`${prefix}"${f.label}" is ${w}px wide — needs ≥ ${f.minWidth}px`);
    if (h && f.minHeight && h < f.minHeight) e.push(`${prefix}"${f.label}" is ${h}px tall — needs ≥ ${f.minHeight}px`);
  }
  // Repeatable blocks (point 3) — validate each block against blockFields.
  if (f.type === "blocks" && Array.isArray(v)) {
    if (f.maxBlocks && v.length > f.maxBlocks) e.push(`${prefix}"${f.label}" allows at most ${f.maxBlocks} items`);
    if (f.minBlocks && v.length < f.minBlocks) e.push(`${prefix}"${f.label}" needs at least ${f.minBlocks} items`);
    v.forEach((block: any, i) => { for (const bf of f.blockFields ?? []) e.push(...validateField(bf, block ?? {}, `${prefix}${f.blockLabel ?? "Item"} ${i + 1} · `)); });
  }
  return e;
}

/** Validate resolved content against the schema (per-field + cross-field). */
export function validateContent(schema: SectionSchema, content: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const prefix = `${schema.label}: `;
  for (const f of schema.fields) errors.push(...validateField(f, content, prefix));
  if (schema.validate) errors.push(...schema.validate(content).map((m) => (m.startsWith(schema.label) ? m : `${prefix}${m}`)));
  return errors;
}

export const ALIGN_OPTIONS = [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }];
