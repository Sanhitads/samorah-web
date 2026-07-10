/**
 * Journal page service — consumer #3 of the Composable Page engine. This is the whole
 * file: a page type is a config, not a rewrite. Same engine, same renderer, same admin
 * as Homepage and About — only the key + default composition differ.
 */
import {
  getPageSections, getPageAdmin, savePageDraft, publishPage, resetPage, listPageRevisions, restorePageRevision, pageCacheTag,
  type ComposedSection, type PageConfig,
} from "@/services/pageComposerService";
import type { Revision } from "@/services/cms/revisions";

export const JOURNAL_KEY = "journal";
export const JOURNAL_ORDER = ["hero", "words", "testimonials", "letters"] as const;
export const JOURNAL_TYPES = [...JOURNAL_ORDER] as const;

export const JOURNAL_META: Record<string, { label: string; note: string }> = {
  hero: { label: "Hero", note: "The Journal opening" },
  words: { label: "Words", note: "An editorial line" },
  testimonials: { label: "Entries", note: "Voices / notes — repeatable blocks" },
  letters: { label: "The Letters", note: "Newsletter close" },
};

export function journalDefaultSections(): ComposedSection[] {
  return JOURNAL_ORDER.map((type, i) => ({ id: type, type, enabled: true, sortOrder: i, settings: {} }));
}

export const JOURNAL_CFG: PageConfig = { validTypes: JOURNAL_TYPES, defaultSections: journalDefaultSections };
export const JOURNAL_CACHE_TAG = pageCacheTag(JOURNAL_KEY);

export const getJournalSections = (opts: { preview?: boolean } = {}) => getPageSections(JOURNAL_KEY, JOURNAL_CFG, opts);
export const getJournalAdmin = () => getPageAdmin(JOURNAL_KEY, JOURNAL_CFG);
export const saveJournalDraft = (data: unknown, actorId?: string) => savePageDraft(JOURNAL_KEY, JOURNAL_CFG, data, actorId);
export const publishJournal = (opts: { publishAt?: string | null; unpublishAt?: string | null } = {}, actorId?: string) => publishPage(JOURNAL_KEY, JOURNAL_CFG, opts, actorId);
export const resetJournal = (actorId?: string) => resetPage(JOURNAL_KEY, actorId);
export const listJournalRevisions = (limit = 30): Promise<Revision[]> => listPageRevisions(JOURNAL_KEY, limit);
export const restoreJournalRevision = (revisionId: string, actorId?: string) => restorePageRevision(JOURNAL_KEY, JOURNAL_CFG, revisionId, actorId);
