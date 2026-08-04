/**
 * Canonical email token resolution + validation — the SINGLE source of truth for how {{tokens}} are
 * extracted, interpolated and validated. Used by render (production send), admin preview, send-test and
 * publish-time validation. Replaces the two duplicated `interpolate()` copies that used to live in
 * `blocks.ts` and `emailTemplateService.ts`.
 */

/** Every {{token}} name in a string (deduped, order-preserving). */
export function extractTokens(str: string): string[] {
  const out: string[] = [];
  String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => { out.push(k); return ""; });
  return [...new Set(out)];
}

/**
 * Interpolate {{token}} → vars[token]. DEFENSE-IN-DEPTH: an unknown/undefined token renders BLANK,
 * so a raw {{token}} can NEVER leak to a customer. Use interpolateTracked when the caller needs to
 * know which tokens were unresolved (e.g. to log an operational defect at send time).
 */
export function interpolate(str: string, vars: Record<string, string>): string {
  return interpolateTracked(str, vars).text;
}
export function interpolateTracked(str: string, vars: Record<string, string>): { text: string; unknown: string[] } {
  const unknown: string[] = [];
  const text = String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => {
    if (vars[k] !== undefined) return vars[k];
    unknown.push(k);
    return ""; // blank — never emit a raw token
  });
  return { text, unknown: [...new Set(unknown)] };
}

/** Levenshtein distance (small strings). */
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

/** Nearest allowed token to an unknown one (for "did you mean …?"), or null when nothing is close. */
export function suggestToken(unknown: string, allowed: string[]): string | null {
  let best: string | null = null, bestD = Infinity;
  for (const a of allowed) { const d = lev(unknown.toLowerCase(), a.toLowerCase()); if (d < bestD) { bestD = d; best = a; } }
  return best && bestD <= Math.max(2, Math.floor(unknown.length / 3)) ? best : null;
}
