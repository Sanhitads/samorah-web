/**
 * Deterministic redirect health (SEO Phase 2 · point 20/24). PURE. Derived ONLY from the existing
 * Phase-1 graph + lifecycle data — NO traffic signal (instrumentation is deferred), and never a
 * delete recommendation. States: disabled · broken (destination missing/archived) · chain (destination
 * itself redirects) · healthy.
 */
import { normalizePath } from "@/lib/redirects";

export type RedirectHealth = "healthy" | "chain" | "broken" | "disabled";
export interface HealthResult { health: RedirectHealth; detail?: string }

/**
 * @param enabledSources map of normalized from→to for ALL enabled redirects (the live graph).
 * @param destinationBroken true when this row's internal destination resolves to missing/archived
 *        (computed by the caller via the canonical navValidation lifecycle index — not re-derived here).
 */
export function classifyRedirectHealth(row: { enabled: boolean; fromPath: string; toPath: string }, enabledSources: Map<string, string>, destinationBroken: boolean): HealthResult {
  if (!row.enabled) return { health: "disabled" };
  if (destinationBroken) return { health: "broken", detail: row.toPath };
  const to = normalizePath(row.toPath);
  if (enabledSources.has(to)) return { health: "chain", detail: `${to} → ${enabledSources.get(to)}` };
  return { health: "healthy" };
}

export const HEALTH_LABEL: Record<RedirectHealth, string> = { healthy: "Healthy", chain: "Chain", broken: "Broken", disabled: "Disabled" };
