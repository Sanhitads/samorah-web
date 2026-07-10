/**
 * Homepage integrity (review point 6). Blocks publishing a broken homepage:
 *   - at least one enabled section (a homepage can't be empty)
 *   - every enabled section passes its schema's required-field checks
 * Warnings (non-blocking) flag softer issues (no Hero → no opening).
 */
import { SECTION_DEFS } from "@/config/homepageSchemas";
import { resolveContent, validateContent } from "@/lib/cms/sectionSchema";
import { getActiveCampaign } from "@/config/campaigns";
import type { HomeSection } from "@/services/homepageService";

export function validateHomepage(sections: HomeSection[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const enabled = (sections ?? []).filter((s) => s.enabled);

  if (!Array.isArray(sections) || !enabled.length) { errors.push("At least one section must be enabled to publish"); return { errors, warnings }; }
  if (!enabled.some((s) => s.type === "hero")) warnings.push("No Hero section is enabled — the homepage has no opening.");

  const campaignId = getActiveCampaign().id;
  for (const s of enabled) {
    const def = SECTION_DEFS[s.type];
    if (!def) continue;
    const content = resolveContent(def.schema, def.defaults(campaignId), s.settings as Record<string, unknown>);
    errors.push(...validateContent(def.schema, content));
  }
  return { errors, warnings };
}
