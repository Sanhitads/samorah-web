/**
 * Redirect-graph validation (SEO Phase 1 · point 1). PURE + synchronous so it unit-tests cleanly and
 * runs both server-side (block on publish) and in the admin UI (live feedback). It validates a candidate
 * redirect against the COMPLETE set of currently-active redirects, not just the form in isolation.
 *
 * Detects: direct self-loop, INDIRECT loop (a→b→c→a), a chain (destination itself redirects — warn +
 * offer to flatten to the final target), and a duplicate/conflicting source. Path comparison uses the
 * canonical `normalizePath` (the same rule middleware matches on) so admin validation === runtime.
 */
import { normalizePath } from "@/lib/redirects";

export interface RedirectEdge { id?: string; from: string; to: string; enabled?: boolean }
export interface RedirectGraphResult {
  errors: string[];
  warnings: string[];
  /** When the destination itself redirects onward, the terminal target — offered as "Use final destination". */
  finalDestination?: string;
}

/**
 * Analyze `candidate` against `existing` (all redirect rows). Only ENABLED existing rows form the live
 * graph (a disabled rule doesn't redirect). The candidate's own row (by id) is excluded so editing a
 * rule doesn't see itself as a duplicate.
 */
export function analyzeRedirectGraph(candidate: { id?: string; from: string; to: string }, existing: RedirectEdge[]): RedirectGraphResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const from = normalizePath(candidate.from);
  const to = normalizePath(candidate.to);

  // Live graph of OTHER active redirects: from → to (from is unique in the DB).
  const others = new Map<string, string>();
  for (const e of existing) {
    if (e.enabled === false || e.id === candidate.id) continue;
    others.set(normalizePath(e.from), normalizePath(e.to));
  }

  // Duplicate / conflicting source — another active rule already redirects this exact source.
  if (others.has(from)) errors.push(`Another redirect already sends ${from} → ${others.get(from)}. A path can only redirect to one place.`);

  // Direct self-loop.
  if (from === to) {
    errors.push(`This redirect points to itself (${from} → ${to}).`);
    return { errors, warnings };
  }

  // Full graph including the candidate, then walk forward from the destination looking for a cycle
  // back to any already-seen node (which includes `from`).
  const graph = new Map(others);
  graph.set(from, to);

  const seen = new Set<string>([from]);
  const path: string[] = [from];
  let node = to;
  let terminal = to; // where the chain ends if there's no cycle
  while (true) {
    path.push(node);
    if (seen.has(node)) {
      errors.push(`This creates a redirect loop: ${path.join(" → ")}.`);
      return { errors, warnings };
    }
    seen.add(node);
    if (!graph.has(node)) { terminal = node; break; }
    node = graph.get(node)!;
  }

  // No cycle. If the destination was ITSELF a redirect source, this is a chain → recommend flattening.
  if (others.has(to)) {
    warnings.push(`Destination ${to} already redirects to ${terminal}. Consider redirecting directly to ${terminal}.`);
    return { errors, warnings, finalDestination: terminal };
  }

  return { errors, warnings };
}
