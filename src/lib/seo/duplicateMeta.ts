/**
 * Explicit-override duplicate metadata detection (SEO Phase 3 · P2-11). DETERMINISTIC and PURE, over the
 * stored seo_overrides ONLY — NOT a full-site duplicate scanner. Effective titles/descriptions of routes
 * without an override are entity-derived and not centrally stored, so full-site detection would require
 * crawling/route generation (deferred). This surfaces the reliably-detectable subset with an honest label.
 */
export interface OverrideMeta { path: string; title: string; description: string }
export interface DuplicateGroup { field: "title" | "description"; value: string; paths: string[] }

export function findOverrideDuplicates(overrides: OverrideMeta[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  for (const field of ["title", "description"] as const) {
    const byVal = new Map<string, { value: string; paths: string[] }>();
    for (const o of overrides) {
      const v = String(o[field] ?? "").trim();
      if (!v) continue;
      const key = v.toLowerCase();
      const e = byVal.get(key) ?? { value: v, paths: [] };
      e.paths.push(o.path);
      byVal.set(key, e);
    }
    for (const { value, paths } of byVal.values()) if (paths.length > 1) groups.push({ field, value, paths });
  }
  return groups;
}
