/**
 * Redirect list search / filter / sort (SEO Phase 2 · point 18). PURE. Only exposes controls backed by
 * data we actually store — NO traffic-based sorts (hit instrumentation is deferred). Filters: all /
 * active / disabled / permanent(301) / temporary(302) / problems(health broken|chain). Sorts: recently
 * created (created_at) and alphabetical (from_path).
 */
import type { RedirectHealth } from "./redirectHealth";

export interface RedirectListItem {
  id: string; fromPath: string; toPath: string; code: number; enabled: boolean;
  createdAt?: string; health: RedirectHealth;
}
export type RedirectFilter = "all" | "active" | "disabled" | "permanent" | "temporary" | "problems";
export type RedirectSort = "created" | "alpha";

export function filterSortRedirects<T extends RedirectListItem>(rows: T[], opts: { query?: string; filter?: RedirectFilter; sort?: RedirectSort }): T[] {
  const q = (opts.query ?? "").trim().toLowerCase();
  const filter = opts.filter ?? "all";
  const sort = opts.sort ?? "created";

  let out = rows.filter((r) => {
    if (q && !(`${r.fromPath} ${r.toPath}`.toLowerCase().includes(q))) return false;
    switch (filter) {
      case "active": return r.enabled;
      case "disabled": return !r.enabled;
      case "permanent": return r.code === 301;
      case "temporary": return r.code === 302;
      case "problems": return r.health === "broken" || r.health === "chain";
      default: return true;
    }
  });

  out = [...out].sort((a, b) =>
    sort === "alpha"
      ? a.fromPath.localeCompare(b.fromPath)
      : (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.fromPath.localeCompare(b.fromPath),
  );
  return out;
}
