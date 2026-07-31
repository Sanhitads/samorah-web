/**
 * Homepage service — now a THIN CONSUMER of the generic Composable Page engine
 * (pageComposerService). It supplies the homepage's section vocabulary + default
 * composition; all persistence/publish/revisions come from the shared engine. About
 * (and future page types) are identical consumers — that's the generalisation.
 */
import type { PublishStatus } from "@/lib/cms/publishable";
import {
  getPageSections, getPageAdmin, savePageDraft, publishPage, resetPage, listPageRevisions, restorePageRevision, pageCacheTag,
  type ComposedSection, type PageConfig, type PageAdminView,
} from "@/services/pageComposerService";
import type { Revision } from "@/services/cms/revisions";

export const PAGE_KEY = "homepage";

/** The sections that compose the DEFAULT homepage (the current hand-built order). */
export const DEFAULT_ORDER = ["hero", "chapters", "brand-story", "atmosphere", "invitations", "words", "editorial-world", "letters"] as const;
/** All section types the homepage can render (default set + optional add-ons). */
export const SECTION_TYPES = [...DEFAULT_ORDER, "testimonials", "content-blocks", "featured-content"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_META: Record<SectionType, { label: string; note: string }> = {
  hero: { label: "Hero", note: "Campaign-driven opening" },
  chapters: { label: "Signature Chapters", note: "Editorial chapter rail" },
  "brand-story": { label: "Brand Story", note: "The maker's quiet" },
  atmosphere: { label: "Featured Atmosphere", note: "Selectable fragrances — each with its own image; pull from a product or write your own" },
  invitations: { label: "Living with Fragrance", note: "Two ways of living" },
  words: { label: "Words", note: "One literary sentence" },
  "editorial-world": { label: "Editorial World", note: "The final magazine spread" },
  letters: { label: "The Letters", note: "Quiet editorial close" },
  testimonials: { label: "Testimonials", note: "Reader voices — repeatable blocks" },
  "content-blocks": { label: "Editorial content", note: "Compose from Quote / Paragraph / Heading / Image / Button blocks — reorder freely" },
  "featured-content": { label: "Featured spotlight", note: "Feature any product / chapter / atmosphere / testimonial / artist / journal piece — picked from a dropdown" },
};

export interface HomeSection extends ComposedSection { type: SectionType }
export type HomepageAdminView = PageAdminView;

export function defaultSections(): HomeSection[] {
  return DEFAULT_ORDER.map((type, i) => ({ id: type, type, enabled: true, sortOrder: i, settings: {} }));
}

export const HOMEPAGE_CFG: PageConfig = { validTypes: SECTION_TYPES, defaultSections };
export const HOMEPAGE_CACHE_TAG = pageCacheTag(PAGE_KEY);

// ── Thin wrappers over the generic engine (stable public API) ──
export const getHomepageSections = (opts: { preview?: boolean } = {}) => getPageSections(PAGE_KEY, HOMEPAGE_CFG, opts) as Promise<HomeSection[]>;
export const getHomepageAdmin = () => getPageAdmin(PAGE_KEY, HOMEPAGE_CFG);
export const saveHomepageDraft = (data: unknown, actorId?: string) => savePageDraft(PAGE_KEY, HOMEPAGE_CFG, data, actorId);
export const publishHomepage = (opts: { publishAt?: string | null; unpublishAt?: string | null } = {}, actorId?: string) => publishPage(PAGE_KEY, HOMEPAGE_CFG, opts, actorId);
export const resetHomepage = (actorId?: string) => resetPage(PAGE_KEY, actorId);
export const listHomepageRevisions = (limit = 30): Promise<Revision[]> => listPageRevisions(PAGE_KEY, limit);
export const restoreHomepageRevision = (revisionId: string, actorId?: string) => restorePageRevision(PAGE_KEY, HOMEPAGE_CFG, revisionId, actorId);
