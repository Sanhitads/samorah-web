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

export type FieldType =
  | "text" | "textarea" | "richtext" | "url" | "email" | "media" | "boolean" | "select"
  | "number" | "align" | "color" | "icon" | "date" | "datetime" | "reference" | "blocks";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default?: unknown;
  required?: boolean;
  options?: { value: string; label: string }[]; // select / align

  // ── editor help (review point 7) ──
  help?: string;
  placeholder?: string;
  description?: string;       // longer guidance shown under the label
  tooltip?: string;          // hover hint
  recommendedSize?: string;  // media, e.g. "1600×900"

  // ── field-level validation (point 6) ──
  maxLength?: number;
  minLength?: number;
  pattern?: string;          // regex source
  patternMessage?: string;
  min?: number;              // number
  max?: number;
  minWidth?: number;         // image (enforced when dimensions are known)
  minHeight?: number;
  aspectRatio?: string;      // image, e.g. "16:9" (enforced when dimensions known)
  allowedMime?: string[];    // media, e.g. ["image/jpeg","image/webp"]
  unique?: boolean;          // within a blocks list, this field must be unique

  // ── conditional visibility (point 2) ──
  showIf?: { field: string; equals?: unknown; truthy?: boolean };

  // ── alt-text validation (Phase 5 · point 22) ── set on a TEXT field to mark it as the alt text
  //    for the sibling media field named here. The editor warns when that image is set but this alt
  //    is blank, and offers a "Decorative" toggle (stored in `<altFor>__decorative`) to suppress it.
  altFor?: string;

  // ── references (point 5) ── value is { entity, id } (stores the ID, not a slug)
  refEntity?: "page" | "chapter" | "collection" | "product" | "blog" | "media" | "author" | "atmosphere" | "testimonial" | "artist" | "journal";
  // ── featured-content pickers (Phase 7 · point 28) ── on a `reference` field, when an item is picked
  //    its `data[<dataKey>]` is copied into the sibling field `<fieldKey>` (denormalised display fields,
  //    then editable). Map = { dataKey: fieldKey }. Lets a section feature any entity from a dropdown.
  refFill?: Record<string, string>;

  // ── localisation (point 10) ── when true, the value is stored locale-keyed
  //    ({ en: "…", hi: "…" }) and read via resolveLocalized(); cheap seam today.
  localized?: boolean;

  // ── repeatable blocks (point 1/3, nestable) ── value is a list of sub-records;
  //    blockFields may themselves contain `blocks`, giving nested repeaters (FAQ,
  //    timeline…). The form + validator recurse.
  blockLabel?: string;
  blockFields?: FieldDef[];
  minBlocks?: number;
  maxBlocks?: number;
  // ── heterogeneous blocks (point 17/18) ── each block carries a `_type` and uses the matching
  //    variant's fields; the editor offers a "+ Add <label>" per variant and reordering across all.
  blockVariants?: { key: string; label: string; fields: FieldDef[] }[];
  // ── block "pull from" source (Homepage: Featured Atmosphere → a real product) ── when set on a
  //    `blocks` field, each block gets a picker of the entity; choosing one fills the mapped block
  //    fields from that entity's `data` (still fully editable afterwards). map = { blockField: dataKey }.
  blockSource?: { entity: string; label?: string; map: Record<string, string> };
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
const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

// ── Localisation seam (point 10) ── field values may be plain OR locale-keyed maps.
export const DEFAULT_LOCALE = "en";
export const LOCALES = ["en"] as const; // extend when locales ship; the data model is ready today
/** Read a possibly-localised value for a locale (falls back to default → any). */
export function resolveLocalized(value: unknown, locale = DEFAULT_LOCALE): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const m = value as Record<string, unknown>;
    if (locale in m) return m[locale];
    if (DEFAULT_LOCALE in m) return m[DEFAULT_LOCALE];
  }
  return value;
}

/** Validate one field's value; returns error strings (prefixed by the caller). */
function validateField(f: FieldDef, content: Record<string, unknown>, prefix: string): string[] {
  const e: string[] = [];
  if (!isFieldVisible(f, content)) return e; // hidden ⇒ not validated (conditional-required, point 5)
  const v = content[f.key];

  if (f.required && (v === undefined || v === null || isBlankStr(v) || (f.type === "blocks" && (!Array.isArray(v) || !v.length)))) {
    e.push(`${prefix}"${f.label}" is required`); return e;
  }
  const raw = f.localized ? resolveLocalized(v) : v;
  if (typeof raw === "string" && raw.trim()) {
    if (f.maxLength && raw.length > f.maxLength) e.push(`${prefix}"${f.label}" must be ≤ ${f.maxLength} characters (is ${raw.length})`);
    if (f.minLength && raw.length < f.minLength) e.push(`${prefix}"${f.label}" must be ≥ ${f.minLength} characters`);
    if (f.pattern && !new RegExp(f.pattern).test(raw)) e.push(`${prefix}${f.patternMessage ?? `"${f.label}" has an invalid format`}`);
    if (f.type === "url" && !looksLikeUrl(raw)) e.push(`${prefix}"${f.label}" must be a URL, path, or anchor`);
    if (f.type === "email" && !isEmail(raw)) e.push(`${prefix}"${f.label}" must be a valid email`);
  }
  if (f.type === "number" && typeof v === "number") {
    if (f.min !== undefined && v < f.min) e.push(`${prefix}"${f.label}" must be ≥ ${f.min}`);
    if (f.max !== undefined && v > f.max) e.push(`${prefix}"${f.label}" must be ≤ ${f.max}`);
  }
  if (f.type === "reference" && f.required && !(v && typeof v === "object" && (v as any).id)) {
    e.push(`${prefix}"${f.label}" must reference a ${f.refEntity ?? "record"}`);
  }
  // Media constraints — enforced when a metadata sidecar (<key>__w/__h/__mime) is present.
  if (f.type === "media") {
    const w = Number(content[`${f.key}__w`]); const h = Number(content[`${f.key}__h`]); const mime = content[`${f.key}__mime`] as string | undefined;
    if (w && f.minWidth && w < f.minWidth) e.push(`${prefix}"${f.label}" is ${w}px wide — needs ≥ ${f.minWidth}px`);
    if (h && f.minHeight && h < f.minHeight) e.push(`${prefix}"${f.label}" is ${h}px tall — needs ≥ ${f.minHeight}px`);
    if (w && h && f.aspectRatio) {
      const [aw, ah] = f.aspectRatio.split(":").map(Number);
      if (aw && ah && Math.abs(w / h - aw / ah) > 0.02) e.push(`${prefix}"${f.label}" should be ${f.aspectRatio} (is ${(w / h).toFixed(2)}:1)`);
    }
    if (mime && f.allowedMime && !f.allowedMime.includes(mime)) e.push(`${prefix}"${f.label}" must be one of ${f.allowedMime.join(", ")}`);
  }
  // Repeatable blocks (nestable) — validate each block against blockFields, + uniqueness.
  if (f.type === "blocks" && Array.isArray(v)) {
    if (f.maxBlocks && v.length > f.maxBlocks) e.push(`${prefix}"${f.label}" allows at most ${f.maxBlocks} items`);
    if (f.minBlocks && v.length < f.minBlocks) e.push(`${prefix}"${f.label}" needs at least ${f.minBlocks} items`);
    for (const uf of (f.blockFields ?? []).filter((bf) => bf.unique)) {
      const seen = new Set<string>();
      v.forEach((b: any) => { const val = String(b?.[uf.key] ?? "").trim(); if (val) { if (seen.has(val)) e.push(`${prefix}"${uf.label}" must be unique across ${f.blockLabel ?? "items"} ("${val}" repeats)`); seen.add(val); } });
    }
    if (f.blockVariants) {
      // Heterogeneous blocks — validate each against its variant's fields (point 17/18).
      const byKey = new Map(f.blockVariants.map((bv) => [bv.key, bv]));
      v.forEach((block: any, i) => { const variant = byKey.get(block?._type); for (const bf of variant?.fields ?? []) e.push(...validateField(bf, block ?? {}, `${prefix}${variant?.label ?? "Block"} ${i + 1} · `)); });
    } else {
      v.forEach((block: any, i) => { for (const bf of f.blockFields ?? []) e.push(...validateField(bf, block ?? {}, `${prefix}${f.blockLabel ?? "Item"} ${i + 1} · `)); });
    }
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
