/**
 * About page service — consumer #2 of the Composable Page engine. Proves the
 * generalisation: About is composed from the SAME reusable section types as the
 * homepage (hero, brand-story, words, testimonials, letters), with its own default
 * order — no new engine, table, or rendering code. A page type is a config, not a
 * rewrite.
 */
import {
  getPageSections, getPageAdmin, savePageDraft, publishPage, resetPage, listPageRevisions, restorePageRevision, pageCacheTag,
  type ComposedSection, type PageConfig,
} from "@/services/pageComposerService";
import type { Revision } from "@/services/cms/revisions";

export const ABOUT_KEY = "about";
export const ABOUT_ORDER = ["hero", "brand-story", "words", "testimonials", "letters"] as const;
export const ABOUT_TYPES = [...ABOUT_ORDER] as const;

export const ABOUT_META: Record<string, { label: string; note: string }> = {
  hero: { label: "Hero", note: "The About opening" },
  "brand-story": { label: "Brand Story", note: "Who we are" },
  words: { label: "Words", note: "A defining line" },
  testimonials: { label: "Testimonials", note: "Voices — repeatable blocks" },
  letters: { label: "The Letters", note: "Newsletter close" },
};

export function aboutDefaultSections(): ComposedSection[] {
  return ABOUT_ORDER.map((type, i) => ({ id: type, type, enabled: true, sortOrder: i, settings: {} }));
}

export const ABOUT_CFG: PageConfig = { validTypes: ABOUT_TYPES, defaultSections: aboutDefaultSections };
export const ABOUT_CACHE_TAG = pageCacheTag(ABOUT_KEY);

export const getAboutSections = (opts: { preview?: boolean } = {}) => getPageSections(ABOUT_KEY, ABOUT_CFG, opts);
export const getAboutAdmin = () => getPageAdmin(ABOUT_KEY, ABOUT_CFG);
export const saveAboutDraft = (data: unknown, actorId?: string) => savePageDraft(ABOUT_KEY, ABOUT_CFG, data, actorId);
export const publishAbout = (opts: { publishAt?: string | null; unpublishAt?: string | null } = {}, actorId?: string) => publishPage(ABOUT_KEY, ABOUT_CFG, opts, actorId);
export const resetAbout = (actorId?: string) => resetPage(ABOUT_KEY, actorId);
export const listAboutRevisions = (limit = 30): Promise<Revision[]> => listPageRevisions(ABOUT_KEY, limit);
export const restoreAboutRevision = (revisionId: string, actorId?: string) => restorePageRevision(ABOUT_KEY, ABOUT_CFG, revisionId, actorId);
