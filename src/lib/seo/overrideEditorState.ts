/**
 * Pure state kernels for the SEO-override editor (UI/UX polish pass · Increment G).
 * Extracted so the editor's two safety-relevant invariants are unit-testable in vitest's node env
 * (the component is JSX and cannot be):
 *   1. "Discard changes" resets the in-progress draft to an EMPTY, route-less draft. Because it
 *      addresses no route (path === ""), it can neither update nor delete a persisted override —
 *      deletion is a separate, explicitly-confirmed action on the overrides table row.
 *   2. The Advanced-sitemap disclosure auto-opens only when the override already carries sitemap
 *      values, and toggling it open/closed changes ONLY the open flag — never the draft values.
 * These are presentation-state helpers, NOT SEO resolution — no new resolver/engine/store.
 */
export type SeoOverrideDraft = {
  path: string; title: string; description: string; ogImage: string;
  robots: string; canonical: string; sitemapPriority: string; changeFreq: string;
};

export const EMPTY_OVERRIDE_DRAFT: SeoOverrideDraft = {
  path: "", title: "", description: "", ogImage: "", robots: "", canonical: "", sitemapPriority: "", changeFreq: "",
};

/** Discard → a fresh empty draft. path === "" ⇒ it targets no persisted route (no update, no delete). */
export const discardDraft = (): SeoOverrideDraft => ({ ...EMPTY_OVERRIDE_DRAFT });

/** Auto-open the Advanced-sitemap disclosure only when the override already has sitemap values. */
export const shouldAutoOpenAdvanced = (s: Pick<SeoOverrideDraft, "sitemapPriority" | "changeFreq">): boolean =>
  Boolean(s.sitemapPriority || s.changeFreq);

/** Toggling the disclosure changes ONLY the open flag; the draft (incl. sitemap values) is preserved. */
export const preserveDraftAcrossDisclosure = <T extends SeoOverrideDraft>(draft: T, open: boolean): { draft: T; open: boolean } =>
  ({ draft, open });
