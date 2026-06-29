/**
 * Template Engine (§16, §17) — a template is the default ordered `Section[]` for
 * an experience / page-type; a page's own sections override it (by id) and
 * extend it. Templates are VERSIONED (pages can pin a revision), support
 * INHERITANCE (a Limited Edition Chapter extends Editorial Chapter), carry a
 * MANIFEST + INTENT for the CMS, and declare COMPOSITION RULES so editors can't
 * build invalid pages. Framework-agnostic.
 * Principles: Composition over Templates; Versions over Breakage; One Source of Truth.
 */
import type { SectionInstance, SectionType, TemplateSlot } from "./section";
import type { ExperienceKind } from "./page";
import type { AssetRef } from "./asset";
import type { ValidationIssue } from "./primitives";

export type TemplateCategory =
  | "editorial"
  | "commerce"
  | "campaign"
  | "landing"
  | "system"
  | (string & {});

/** What a template type supports — the CMS presents templates from this. */
export interface TemplateCapabilities {
  products?: boolean;
  chapters?: boolean;
  campaigns?: boolean;
  seo?: boolean;
  blocks?: boolean;
  personalization?: boolean;
}

/** Editorial / business intent — not for rendering; for CMS, analytics, reporting. */
export interface TemplateIntent {
  audience?: string;
  seoIntent?: string;
  editorialGoal?: string;
  commerceEmphasis?: "none" | "soft" | "primary";
}

/** Composition rules that keep the editor intelligent as the library grows. */
export interface TemplateRules {
  requiredSlots?: TemplateSlot[];
  requiredTypes?: SectionType[];
  optionalTypes?: SectionType[];
  maxOccurrences?: Record<string, number>; // section type → max
}

export interface TemplateRef {
  id: string;
  version?: number;
}

export interface Template {
  id: string;
  version?: number; // pages can pin a revision; default 1
  extends?: TemplateRef; // inheritance — reuse a base, override the rest
  experienceKind?: ExperienceKind;
  // — manifest (the CMS presents templates from this) —
  label?: string;
  description?: string;
  previewAsset?: AssetRef;
  category?: TemplateCategory;
  capabilities?: TemplateCapabilities;
  intent?: TemplateIntent;
  rules?: TemplateRules;
  // — the default ordered sequence —
  sections: SectionInstance[];
}

// — versioned registry —
const TEMPLATES = new Map<string, Template>(); // key = `${id}@${version}`
const LATEST = new Map<string, number>(); // id → latest version

const key = (id: string, version: number) => `${id}@${version}`;

export function registerTemplate(t: Template): void {
  const version = t.version ?? 1;
  TEMPLATES.set(key(t.id, version), { ...t, version });
  if (version >= (LATEST.get(t.id) ?? 0)) LATEST.set(t.id, version);
}

/** A specific version, or the latest registered. */
export function getTemplate(id: string, version?: number): Template | undefined {
  const v = version ?? LATEST.get(id);
  return v ? TEMPLATES.get(key(id, v)) : undefined;
}

export function getTemplatesForExperience(kind: ExperienceKind): Template[] {
  return [...TEMPLATES.values()].filter((t) => t.experienceKind === kind);
}

function mergeSection(
  base: SectionInstance,
  override: SectionInstance,
): SectionInstance {
  return {
    ...base,
    ...override,
    settings: { ...base.settings, ...override.settings },
    campaignOverrides: {
      ...(base.campaignOverrides ?? {}),
      ...(override.campaignOverrides ?? {}),
    },
  };
}

/** Base defaults, with overriding sections merged by id and new ones appended. */
export function composeSections(
  baseSections: SectionInstance[],
  overrideSections: SectionInstance[] = [],
): SectionInstance[] {
  const byId = new Map<string, SectionInstance>();
  for (const s of baseSections) byId.set(s.id, s);
  for (const o of overrideSections) {
    const base = byId.get(o.id);
    byId.set(o.id, base ? mergeSection(base, o) : o);
  }
  return [...byId.values()];
}

function mergeRules(base?: TemplateRules, child?: TemplateRules): TemplateRules | undefined {
  if (!base) return child;
  if (!child) return base;
  const uniq = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];
  return {
    requiredSlots: uniq(base.requiredSlots, child.requiredSlots),
    requiredTypes: uniq(base.requiredTypes, child.requiredTypes),
    optionalTypes: uniq(base.optionalTypes, child.optionalTypes),
    maxOccurrences: { ...base.maxOccurrences, ...child.maxOccurrences },
  };
}

/** Resolve a template by merging its `extends` chain (child overrides win). */
export function resolveTemplate(
  id: string,
  version?: number,
  seen: Set<string> = new Set(),
): Template | undefined {
  const t = getTemplate(id, version);
  if (!t) return undefined;
  if (!t.extends || seen.has(t.id)) return t;
  const base = resolveTemplate(
    t.extends.id,
    t.extends.version,
    new Set(seen).add(t.id),
  );
  if (!base) return t;
  return {
    ...base,
    ...t,
    sections: composeSections(base.sections, t.sections),
    capabilities: { ...base.capabilities, ...t.capabilities },
    intent: { ...base.intent, ...t.intent },
    rules: mergeRules(base.rules, t.rules),
  };
}

/** Resolve a page's final sections from its template (resolved) + its own. */
export function resolvePageSections(
  templateId: string,
  pageSections?: SectionInstance[],
  version?: number,
): SectionInstance[] {
  const resolved = resolveTemplate(templateId, version);
  if (!resolved) return pageSections ?? [];
  return composeSections(resolved.sections, pageSections ?? []);
}

/** Validate a composed page against its template's rules (CMS publish-time). */
export function validateComposition(
  template: Template,
  sections: SectionInstance[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rules = template.rules;
  if (!rules) return issues;

  const counts = new Map<string, number>();
  const slots = new Set<string>();
  for (const s of sections) {
    if (s.visibility === false) continue;
    counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
    if (s.slot) slots.add(s.slot);
  }

  for (const type of rules.requiredTypes ?? []) {
    if (!counts.get(type)) issues.push({ message: `Missing required section: ${type}.` });
  }
  for (const slot of rules.requiredSlots ?? []) {
    if (!slots.has(slot)) issues.push({ message: `Missing required slot: ${slot}.` });
  }
  for (const [type, max] of Object.entries(rules.maxOccurrences ?? {})) {
    const c = counts.get(type) ?? 0;
    if (c > max) {
      issues.push({ message: `Too many "${type}" sections (max ${max}, found ${c}).` });
    }
  }
  return issues;
}
