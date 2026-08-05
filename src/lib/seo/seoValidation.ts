/**
 * Pure SEO validation + mapping helpers (SEO Phase 1 · points 6·7·8). No I/O — unit-testable, shared by
 * the service (block/warn on save) and the admin UI (live guidance). Anything requiring DB lifecycle
 * (destination existence/liveness) lives in the service, reusing the canonical navValidation resolver.
 */

// ── Robots: structured controls ⇄ canonical directive string (point 6) ───────────────────────────────
export interface RobotsControls { index: boolean; follow: boolean; extra: string[] }

/** Parse a stored robots string ("noindex,nofollow", "" = default index,follow) into structured controls,
 *  preserving any advanced directives (noarchive, nosnippet, …) so they survive a round-trip. */
export function parseRobots(robots: string | null | undefined): RobotsControls {
  const tokens = String(robots ?? "").toLowerCase().split(",").map((t) => t.trim()).filter(Boolean);
  const known = new Set(["index", "noindex", "follow", "nofollow"]);
  return {
    index: !tokens.includes("noindex"),
    follow: !tokens.includes("nofollow"),
    extra: tokens.filter((t) => !known.has(t)),
  };
}

/** Build the canonical directive string from controls. Default (index+follow, no extras) → "" so the
 *  storefront emits its normal indexable default rather than a redundant "index,follow". */
export function buildRobots(c: RobotsControls): string {
  const out: string[] = [];
  if (!c.index) out.push("noindex");
  if (!c.follow) out.push("nofollow");
  out.push(...(c.extra ?? []));
  return out.join(",");
}

/** True when a robots value removes the page from search (noindex present). */
export function isNoindex(robots: string | null | undefined): boolean {
  return !parseRobots(robots).index;
}

// Major, deliberately-indexable storefront surfaces — noindex here is almost always a mistake (point 6).
const MAJOR_EXACT = new Set(["/", "/shop", "/collections", "/chapters", "/about", "/journal", "/bundles"]);
const MAJOR_PREFIX = ["/shop/", "/collections/", "/chapters/"];
export function isMajorRoute(path: string): boolean {
  const p = (path || "").toLowerCase().replace(/\/+$/, "") || "/";
  return MAJOR_EXACT.has(p) || MAJOR_PREFIX.some((pre) => p.startsWith(pre));
}

// ── Path structure (points 1·3) ──────────────────────────────────────────────────────────────────────
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/** Structural validation for an internal-or-external path/URL. `role` tunes messages + query/hash rules. */
export function validatePathStructure(raw: string, opts: { allowExternal?: boolean; role?: "source" | "destination" | "canonical" } = {}): { error?: string; warn?: string } {
  const h = String(raw ?? "").trim();
  if (!h) return { error: "Path is required." };
  // eslint-disable-next-line no-control-regex
  if (/[\s\\]/.test(h) || h.includes("..") || [...h].some((ch) => ch.charCodeAt(0) < 32)) return { error: `"${h}" is malformed (no spaces, backslashes or "..").` };
  if (h.startsWith("//")) return { error: `Protocol-relative URLs ("//…") aren't allowed — use a "/" site path.` };
  const scheme = h.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme) {
    if (!SAFE_SCHEMES.has(scheme)) return { error: `Unsafe link protocol "${scheme}:" is not allowed.` };
    if (!opts.allowExternal) return { error: `External URLs aren't allowed here — use a /site path.` };
    return {}; // safe external
  }
  if (!h.startsWith("/")) return { error: `"${h}" must be an absolute /site path (start with "/").` };
  // A redirect SOURCE matches on pathname only — a query/hash in the source can never match at runtime.
  if (opts.role === "source" && /[?#]/.test(h)) return { warn: `The "from" path includes a query/hash; redirects match the path only, so this may never fire.` };
  return {};
}

// ── Canonical URL (point 7) ──────────────────────────────────────────────────────────────────────────
/** Validate a canonical URL. Same-domain (absolute or "/path") is normal; a cross-domain canonical is
 *  legitimate but risky → warn (+ the caller requires explicit confirmation). Unsafe/malformed → error. */
export function validateCanonical(raw: string, siteHost: string): { error?: string; warn?: string; crossDomain?: boolean } {
  const h = String(raw ?? "").trim();
  if (!h) return {};
  if (h.startsWith("/")) return validatePathStructure(h, { role: "canonical" }); // same-site relative
  const scheme = h.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme) return { error: `Canonical must be an absolute https:// URL or a "/" path.` };
  if (scheme !== "http" && scheme !== "https") return { error: `Canonical has an unsafe protocol "${scheme}:".` };
  let host: string;
  try { host = new URL(h).host.toLowerCase(); } catch { return { error: `Canonical is not a valid URL.` }; }
  const norm = (x: string) => x.toLowerCase().replace(/^www\./, "");
  if (norm(host) === norm(siteHost)) return {};
  return { warn: `Canonical points to a different domain (${host}). This tells search engines another site owns this content.`, crossDomain: true };
}

// ── Title / description length guidance (point 8 — INFO/WARN, never a blocker) ────────────────────────
export type Guidance = { level: "info" | "warn"; text: string } | null;
export function titleGuidance(len: number): Guidance {
  if (len === 0) return null;
  if (len < 30) return { level: "info", text: "Very short — you have room for more detail." };
  if (len <= 60) return { level: "info", text: "Good working length." };
  return { level: "warn", text: "May be truncated in search results." };
}
export function descriptionGuidance(len: number): Guidance {
  if (len === 0) return null;
  if (len < 70) return { level: "info", text: "A bit short — search engines may pad it." };
  if (len <= 160) return { level: "info", text: "Good working length." };
  return { level: "warn", text: "May be truncated in search results." };
}
