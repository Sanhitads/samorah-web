/**
 * Page Engine (§5) — resolve a `Page` into its final, ordered `Section[]`, the
 * single `RenderContext` every section receives, and the page's cache policy.
 * Framework-agnostic — the React `PageView` and Next `generateMetadata` consume
 * this. Principles: API before Interface; Composition over Templates; One Source
 * of Truth.
 *
 * ── Resolution pipeline (the fixed order of page resolution) ──────────────────
 *   Page
 *     → Lifecycle    isPagePublished() — caller gates; preview widens it
 *     → [before-resolve middleware]  localization · auth · experiment · campaign
 *     → Template     resolveTemplate() — walk `extends`, merge defaults
 *     → Sections     composeSections() — page overrides template by id
 *     → Relationships  (resolved lazily by sections via the relationship engine)
 *     → Navigation   carried on the page → RenderContext.navigation
 *     → SEO          carried on the page → buildPageMetadata() (UI layer)
 *     → Context      one RenderContext assembled here, passed to every section
 *     → Cache        page.cachePolicy (or derived) → route rendering strategy
 *     → [after-resolve middleware]   analytics · logging · personalization
 *     → Render       SectionRenderer (UI layer)
 * Steps marked [middleware] are reserved seams — declared here, no hooks ship
 * today. Relationships/Navigation/SEO live on the page model; this engine wires
 * them into the context and leaves resolution to their own engines.
 */
import type { Page, PageCachePolicy } from "./page";
import type { SectionInstance } from "./section";
import type { RenderContext, PreviewSession } from "./render";
import { resolvePageSections } from "./template";

export interface ResolvePageOptions {
  /** Show draft/scheduled pages & sections (CMS preview). */
  preview?: boolean;
  /** The richer preview session `preview` grows into; implies preview. [Future] */
  previewSession?: PreviewSession;
  now?: Date;
  /** Pin the page's template to a specific revision. */
  templateVersion?: number;
  /** Per-request environment the renderer can't know statically. */
  env?: Pick<
    RenderContext,
    "device" | "country" | "isLoggedIn" | "featureFlags" | "data"
  >;
}

export interface ResolvedPage {
  page: Page;
  sections: SectionInstance[];
  context: RenderContext;
  /** The rendering strategy this page asks for (Resolve → Cache → Render). */
  cachePolicy: PageCachePolicy;
}

/**
 * Reserved middleware seams (§5). DECLARED, not yet invoked beyond the loops
 * below — localization/auth/experiment/campaign refine the options going in;
 * analytics/logging/personalization observe or refine the resolved page coming
 * out. Hooks run in array order.
 */
export type BeforeResolveHook = (
  page: Page,
  opts: ResolvePageOptions,
) => ResolvePageOptions;
export type AfterResolveHook = (resolved: ResolvedPage) => ResolvedPage;

export interface PageMiddleware {
  beforeResolve?: BeforeResolveHook[];
  afterResolve?: AfterResolveHook[];
}

/**
 * Page-level lifecycle + schedule gate. `published`/undefined renders;
 * `archived` never; other states render only in preview; a schedule window
 * (start/end) hides a published page outside its dates (preview ignores it).
 */
export function isPagePublished(page: Page, preview?: boolean, now?: Date): boolean {
  if (preview) return page.status !== "archived";
  if (page.visibility === false) return false;
  if (page.status === "archived") return false;
  if (page.status && page.status !== "published") return false;

  const s = page.schedule;
  if (s) {
    const t = (now ?? new Date()).getTime();
    const start = s.startAt ?? s.publishAt;
    if (start && new Date(start).getTime() > t) return false;
    if (s.endAt && new Date(s.endAt).getTime() < t) return false;
  }
  return true;
}

/** The cache policy a page asks for, or a sensible default from its lifecycle:
 *  preview → "preview"; an unpublished/scheduled page → "dynamic"; else "static". */
export function resolveCachePolicy(page: Page, preview?: boolean): PageCachePolicy {
  if (page.cachePolicy) return page.cachePolicy;
  if (preview) return { mode: "preview" };
  if (page.status && page.status !== "published") return { mode: "dynamic" };
  if (page.schedule?.endAt || page.schedule?.startAt) return { mode: "isr" };
  return { mode: "static" };
}

/** Compose a page's sections from its template + overrides, build its context,
 *  and attach its cache policy. Optional middleware wraps the resolution. */
export function resolvePage(
  page: Page,
  opts: ResolvePageOptions = {},
  middleware?: PageMiddleware,
): ResolvedPage {
  // before-resolve seam — localization / auth / experiment / campaign
  let options = opts;
  for (const hook of middleware?.beforeResolve ?? []) {
    options = hook(page, options);
  }

  const preview = options.preview ?? Boolean(options.previewSession);

  const sections = resolvePageSections(
    page.template,
    page.sections,
    options.templateVersion,
  );

  const context: RenderContext = {
    pageId: page.id,
    experienceId: page.experienceId,
    journeyId: page.journeyId,
    campaignId: page.campaignId,
    themeToken: page.palette,
    navigation: page.navigation,
    preview,
    previewSession: options.previewSession,
    now: options.now,
    ...options.env,
  };

  let resolved: ResolvedPage = {
    page,
    sections,
    context,
    cachePolicy: resolveCachePolicy(page, preview),
  };

  // after-resolve seam — analytics / logging / personalization
  for (const hook of middleware?.afterResolve ?? []) {
    resolved = hook(resolved);
  }

  return resolved;
}
