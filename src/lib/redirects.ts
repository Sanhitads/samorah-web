/**
 * Redirect map for middleware. DB-driven 301/302s, cached in-module with a short
 * TTL so we hit the DB at most once a minute — middleware runs on every request, so
 * a per-request query would be far too costly. A lightweight REST fetch (no heavy
 * client) keeps it edge-friendly. Publishing a redirect takes effect within the TTL.
 */
interface RedirectRule { to: string; code: number }

let cache: { at: number; map: Map<string, RedirectRule> } | null = null;
const TTL_MS = 60_000;

/** Canonical redirect-path normalization — the SAME rule middleware matches on (trailing-slash- and
 *  case-insensitive). Exported so admin-side graph/loop validation matches runtime behaviour exactly. */
export function normalizePath(p: string): string {
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p.toLowerCase();
}
const normalize = normalizePath;

export async function getRedirectMap(): Promise<Map<string, RedirectRule>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.map;

  const map = new Map<string, RedirectRule>();
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (base && key) {
      const res = await fetch(`${base}/rest/v1/redirects?enabled=eq.true&select=from_path,to_path,code`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        // middleware runs frequently; don't let Next cache this fetch — we TTL it ourselves
        cache: "no-store",
      });
      if (res.ok) {
        for (const r of (await res.json()) as { from_path: string; to_path: string; code: number }[]) {
          map.set(normalize(r.from_path), { to: r.to_path, code: r.code });
        }
      }
    }
  } catch { /* never break the request on a redirect-lookup failure */ }

  cache = { at: now, map };
  return map;
}

/** Resolve a redirect for a path, or null. Ignores no-op (same-path) rules. */
export async function resolveRedirect(pathname: string): Promise<RedirectRule | null> {
  const map = await getRedirectMap();
  const rule = map.get(normalize(pathname));
  if (!rule || normalize(rule.to) === normalize(pathname)) return null;
  return rule;
}
