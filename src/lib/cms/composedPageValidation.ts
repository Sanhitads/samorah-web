/**
 * Composed-page integrity — generic across ALL page types (homepage, about…).
 * Blocks publishing a broken page: at least one enabled section, and every enabled
 * section passes its schema (required/length/pattern/blocks/cross-field). Reads the
 * section definitions from the Composable Page Registry, so a new page type is
 * validated the moment it registers — no per-page validation code.
 */
import { getPageType } from "@/lib/cms/pageRegistry";
import { resolveContent, validateContent } from "@/lib/cms/sectionSchema";
import { getActiveCampaign } from "@/config/campaigns";
import type { ComposedSection } from "@/services/pageComposerService";

export function validateComposedPage(pageKey: string, sections: ComposedSection[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const enabled = (sections ?? []).filter((s) => s.enabled);
  if (!Array.isArray(sections) || !enabled.length) { errors.push("At least one section must be enabled to publish"); return { errors, warnings }; }
  if (pageKey === "homepage" && !enabled.some((s) => s.type === "hero")) warnings.push("No Hero section is enabled — the page has no opening.");

  const pt = getPageType(pageKey);
  const campaignId = getActiveCampaign().id;
  for (const s of enabled) {
    const def = pt?.sections[s.type];
    if (!def) continue;
    const content = resolveContent(def.schema, def.defaults(campaignId), s.settings as Record<string, unknown>);
    errors.push(...validateContent(def.schema, content));
  }
  return { errors, warnings };
}
