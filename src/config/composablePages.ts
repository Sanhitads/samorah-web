/**
 * Composable page catalogue — the small table the generic admin + API read to drive
 * any page type. Adding a page = one entry here + a registerPageType() call. Imports
 * the schema module for its side-effect registration of the page types.
 */
import "@/config/homepageSchemas"; // side-effect: registers homepage + about in the page registry
import { HOMEPAGE_CFG, SECTION_META as HOMEPAGE_META } from "@/services/homepageService";
import { ABOUT_CFG, ABOUT_META } from "@/services/aboutService";
import { JOURNAL_CFG, JOURNAL_META } from "@/services/journalService";
import { getActiveCampaign } from "@/config/campaigns";
import { getPageType, schemasOf } from "@/lib/cms/pageRegistry";
import { resolveContent } from "@/lib/cms/sectionSchema";
import type { PageConfig, ComposedSection } from "@/services/pageComposerService";

export interface ComposablePage {
  key: string; label: string; cfg: PageConfig;
  meta: Record<string, { label: string; note: string }>;
  previewPath: string; previewCookie: string;
}

export const COMPOSABLE_PAGES: Record<string, ComposablePage> = {
  homepage: { key: "homepage", label: "Homepage", cfg: HOMEPAGE_CFG, meta: HOMEPAGE_META, previewPath: "/", previewCookie: "hp_preview" },
  about: { key: "about", label: "About", cfg: ABOUT_CFG, meta: ABOUT_META, previewPath: "/about", previewCookie: "ab_preview" },
  journal: { key: "journal", label: "Journal", cfg: JOURNAL_CFG, meta: JOURNAL_META, previewPath: "/journal", previewCookie: "jn_preview" },
};

/** Effective settings per section (config defaults ⊕ saved) so admin forms show current content. */
export function resolveAdminSections(pageKey: string, sections: ComposedSection[]): ComposedSection[] {
  const pt = getPageType(pageKey);
  const cid = getActiveCampaign().id;
  return sections.map((s) => {
    const def = pt?.sections[s.type];
    return { ...s, settings: def ? resolveContent(def.schema, def.defaults(cid), s.settings) : s.settings };
  });
}

export const pageSchemas = (pageKey: string) => schemasOf(pageKey);
