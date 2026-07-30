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
import { resolveContent, type SectionSchema } from "@/lib/cms/sectionSchema";
import type { PageConfig, ComposedSection } from "@/services/pageComposerService";

export interface ComposablePage {
  key: string; label: string; cfg: PageConfig;
  meta: Record<string, { label: string; note: string }>;
  previewPath: string; previewCookie: string;
  /** When set, the builder shows a side-by-side LIVE preview (postMessage, no save) at this iframe
   *  route — visual-CMS parity with the PDP/chapter editors. The route renders ComposedSections from
   *  the streamed draft, so it fits any composed page whose storefront uses ComposedSections. */
  livePreviewSrc?: string;
}

export const COMPOSABLE_PAGES: Record<string, ComposablePage> = {
  homepage: { key: "homepage", label: "Homepage", cfg: HOMEPAGE_CFG, meta: HOMEPAGE_META, previewPath: "/", previewCookie: "hp_preview", livePreviewSrc: "/homepage-preview" },
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

/**
 * Schemas for a page's sections, SERIALISABLE for the client Page Builder. The
 * cross-field `validate()` hook is a function (used only server-side, in
 * composedPageValidation) and can't cross the server→client boundary — so we strip
 * it here; the client only needs the field definitions.
 */
export const pageSchemas = (pageKey: string): Record<string, SectionSchema> => {
  const s = schemasOf(pageKey);
  return Object.fromEntries(
    Object.entries(s).map(([k, v]) => [k, { type: v.type, label: v.label, note: v.note, fields: v.fields, sourced: v.sourced }]),
  );
};
