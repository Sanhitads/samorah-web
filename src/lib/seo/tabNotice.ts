/**
 * Per-tab notice/busy scoping (SEO Phase 1 · point 12). The old manager kept a single shared `msg`
 * rendered outside the tab conditional, so a redirect-form error/success leaked onto the Meta-overrides
 * tab. Notices are now namespaced by tab; this pure model makes the isolation unit-testable.
 */
export type SeoTab = "redirects" | "seo";
export interface Notice { tone: "ok" | "err" | "warn"; text: string }
export type TabNotices = Partial<Record<SeoTab, Notice | null>>;

export function setTabNotice(state: TabNotices, tab: SeoTab, notice: Notice | null): TabNotices {
  return { ...state, [tab]: notice };
}
export function noticeFor(state: TabNotices, tab: SeoTab): Notice | null {
  return state[tab] ?? null;
}
