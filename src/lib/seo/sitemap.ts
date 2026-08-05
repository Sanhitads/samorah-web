/**
 * Sitemap ⇄ SEO-override merge (SEO Phase 2 · points 15·16·17). PURE + unit-testable. Applies the
 * canonical `seo_overrides` layer to the sitemap's base routes:
 *  - EXCLUDE a route whose override robots resolves to noindex (canonical, override-driven only),
 *  - EXCLUDE a route that is an active redirect SOURCE (it would 301/302 immediately),
 *  - APPLY a valid `sitemap_priority` (0–1) / `change_freq` override, else keep the base default,
 *  - DEDUPLICATE by normalized path.
 *
 * Known boundary (documented, not worked around): a `noindex` set only inside a route's own
 * generateMetadata() — and never written to the seo_overrides layer — is NOT centrally discoverable
 * here. We do not re-run every route's generateMetadata to find it. Override-layer noindex is the
 * deterministic, canonical signal the sitemap acts on.
 */
import { normalizePath } from "@/lib/redirects";
import { isNoindex } from "@/lib/seo/seoValidation";

export type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
export const CHANGE_FREQS: ReadonlySet<string> = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
export function isValidChangeFreq(v: string): v is ChangeFreq { return CHANGE_FREQS.has(v); }
export function isValidPriority(n: number): boolean { return Number.isFinite(n) && n >= 0 && n <= 1; }

export interface SitemapEntry { path: string; changeFrequency: ChangeFreq; priority: number }
export interface SeoOverrideLite { path: string; robots: string; sitemapPriority: string; changeFreq: string }

/** Normalized sitemap key — folds "" (home) and "/" together so it matches an override stored as "/". */
const keyOf = (p: string): string => normalizePath(p) || "/";

export function applySitemapSeo(base: SitemapEntry[], overrides: SeoOverrideLite[], isRedirectSource: (key: string) => boolean): SitemapEntry[] {
  const ov = new Map(overrides.map((o) => [keyOf(o.path), o]));
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  for (const e of base) {
    const key = keyOf(e.path);
    if (seen.has(key)) continue;                 // dedupe
    if (isRedirectSource(key)) continue;         // don't emit a URL that immediately redirects
    const o = ov.get(key);
    if (o && isNoindex(o.robots)) continue;      // canonical override-driven noindex → exclude
    let { priority, changeFrequency } = e;
    if (o) {
      const p = o.sitemapPriority !== "" ? Number(o.sitemapPriority) : NaN;
      if (isValidPriority(p)) priority = p;                                   // valid override wins
      if (isValidChangeFreq(o.changeFreq)) changeFrequency = o.changeFreq;    // else keep base default
    }
    seen.add(key);
    out.push({ path: e.path, priority, changeFrequency });
  }
  return out;
}
