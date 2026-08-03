/**
 * Optional coupon code generator (Phase 3 · point 24). Purely a convenience for the admin form —
 * manual entry always remains available, and the DB unique constraint is the authoritative collision
 * guard. Supports an optional prefix + an unambiguous random suffix (e.g. WELCOME-K7M9P).
 */

// Unambiguous charset: no O/0, I/1/L — readable off a screen or print.
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface CodeGenOptions {
  length?: number; // suffix length (default 5)
  rng?: () => number; // injectable for deterministic tests; defaults to Math.random
}

/** Normalize a prefix to the code alphabet (uppercase A–Z/0–9), trimmed. Empty ⇒ no prefix. */
export function normalizePrefix(prefix?: string | null): string {
  return (prefix ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

/** Generate `PREFIX-SUFFIX` (or just `SUFFIX` when no prefix). Suffix uses the unambiguous charset. */
export function generateCouponCode(prefix?: string | null, opts: CodeGenOptions = {}): string {
  const len = Math.max(3, Math.min(12, opts.length ?? 5));
  const rng = opts.rng ?? Math.random;
  let suffix = "";
  for (let i = 0; i < len; i++) suffix += CHARSET[Math.floor(rng() * CHARSET.length)];
  const p = normalizePrefix(prefix);
  return p ? `${p}-${suffix}` : suffix;
}
