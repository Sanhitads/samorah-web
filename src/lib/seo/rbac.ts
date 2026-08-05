import type { Capability } from "@/lib/auth/capabilities";

/**
 * SEO/Redirects action → required capability (SEO Phase 1 · point 13). Pure + exported so the mapping
 * is unit-tested. SEO/redirect Save is an IMMEDIATE production change (no draft model), so every
 * mutation requires `content.publish`; read-only analysis/preview needs only `content.edit`. This
 * replaces the previous `catalog.manage` gate — one permission model, aligned with Navigation/Email.
 */
export type SeoAction =
  | "redirect.analyze" | "redirect.save" | "redirect.delete"
  | "seo.analyze" | "seo.effective" | "seo.save" | "seo.delete";

const READ_ACTIONS = new Set<string>(["redirect.analyze", "seo.analyze", "seo.effective"]);
const MUTATION_ACTIONS = new Set<string>(["redirect.save", "redirect.delete", "seo.save", "seo.delete"]);

/** The capability required for an action, or null for an unknown action. */
export function requiredCapabilityFor(action: string): Capability | null {
  if (READ_ACTIONS.has(action)) return "content.edit";
  if (MUTATION_ACTIONS.has(action)) return "content.publish";
  return null;
}

export function isMutation(action: string): boolean {
  return MUTATION_ACTIONS.has(action);
}
