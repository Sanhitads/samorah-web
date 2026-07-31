/**
 * Section-level change diff (Phase 8 · point 35 — audit timeline). Compares two composed-page section
 * arrays and reports what changed: sections added/removed, and per-changed-section the exact fields with
 * their previous → new values. Pure + isomorphic; powers the audit log (who/what/when/prev/new) and is
 * unit-tested. Section-management keys (`__state`/`__from`/`__until`) are ignored as noise.
 */
export interface FieldChange { field: string; prev: unknown; next: unknown }
export interface SectionChange { sectionId: string; sectionType: string; kind: "added" | "removed" | "changed"; fields: FieldChange[] }

interface Sec { id: string; type: string; enabled?: boolean; settings?: Record<string, unknown> }

const isMgmt = (k: string) => k.startsWith("__");
const jeq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function diffSections(oldSections: Sec[], newSections: Sec[]): SectionChange[] {
  const oldById = new Map((oldSections ?? []).map((s) => [s.id, s]));
  const newById = new Map((newSections ?? []).map((s) => [s.id, s]));
  const changes: SectionChange[] = [];

  for (const s of newSections ?? []) if (!oldById.has(s.id)) changes.push({ sectionId: s.id, sectionType: s.type, kind: "added", fields: [] });
  for (const s of oldSections ?? []) if (!newById.has(s.id)) changes.push({ sectionId: s.id, sectionType: s.type, kind: "removed", fields: [] });

  for (const s of newSections ?? []) {
    const old = oldById.get(s.id);
    if (!old) continue;
    const fields: FieldChange[] = [];
    if ((old.enabled ?? true) !== (s.enabled ?? true)) fields.push({ field: "enabled", prev: old.enabled ?? true, next: s.enabled ?? true });
    const keys = new Set([...Object.keys(old.settings ?? {}), ...Object.keys(s.settings ?? {})]);
    for (const k of keys) {
      if (isMgmt(k)) continue;
      const a = (old.settings ?? {})[k], b = (s.settings ?? {})[k];
      if (!jeq(a, b)) fields.push({ field: k, prev: a, next: b });
    }
    if (fields.length) changes.push({ sectionId: s.id, sectionType: s.type, kind: "changed", fields });
  }
  return changes;
}

/** A short human summary ("Added Hero · Edited Brand Story (heading, image) · Removed Words"). */
export function summarizeChanges(changes: SectionChange[], labelOf: (type: string) => string = (t) => t): string {
  return changes.map((c) => {
    const label = labelOf(c.sectionType);
    if (c.kind === "added") return `Added ${label}`;
    if (c.kind === "removed") return `Removed ${label}`;
    return `Edited ${label} (${c.fields.map((f) => f.field).join(", ")})`;
  }).join(" · ");
}
