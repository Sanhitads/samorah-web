/**
 * Render context & conditions (§16) — declarative rendering inputs.
 *
 * Responsibility: the context every section receives (page · campaign ·
 * experience · theme · navigation · environment) so sections never resolve these
 * individually, plus the declarative conditions (campaign · auth · country ·
 * device · date · feature flag) the renderer evaluates. Framework-agnostic;
 * environment fields are populated where known (most are server-unknown at build
 * → treated as pass). Principle: Configuration over Hardcoding.
 */
import type { ThemeToken, LifecycleStatus } from "./primitives";
import type { PageNavigation } from "./navigation";

export type DeviceKind = "mobile" | "tablet" | "desktop";

export interface RenderContext {
  pageId?: string;
  experienceId?: string;
  journeyId?: string;
  campaignId?: string;
  themeToken?: ThemeToken;
  navigation?: PageNavigation;
  now?: Date;
  /** Show draft/preview/scheduled sections (CMS preview). */
  preview?: boolean;
  // — environment (populated where known) —
  device?: DeviceKind;
  country?: string;
  isLoggedIn?: boolean;
  featureFlags?: Record<string, boolean>;
  /** Escape hatch for page-specific data a section may need. */
  data?: Record<string, unknown>;
}

/** Declarative "render if" rules. All present rules must pass (AND). */
export interface RenderCondition {
  campaign?: string;
  loggedIn?: boolean;
  country?: string[];
  device?: DeviceKind[];
  dateRange?: { from?: string; to?: string };
  featureFlag?: string;
}

/** Evaluate a condition against a context. Rules the context can't evaluate
 *  (unknown environment) are treated as a pass — they never hide content. */
export function evaluateRenderCondition(
  cond: RenderCondition | undefined,
  ctx: RenderContext,
): boolean {
  if (!cond) return true;
  if (cond.campaign !== undefined && ctx.campaignId !== cond.campaign) return false;
  if (
    cond.loggedIn !== undefined &&
    ctx.isLoggedIn !== undefined &&
    ctx.isLoggedIn !== cond.loggedIn
  )
    return false;
  if (cond.country?.length && ctx.country !== undefined && !cond.country.includes(ctx.country))
    return false;
  if (cond.device?.length && ctx.device !== undefined && !cond.device.includes(ctx.device))
    return false;
  if (cond.featureFlag && ctx.featureFlags && ctx.featureFlags[cond.featureFlag] === false)
    return false;
  if (cond.dateRange) {
    const t = (ctx.now ?? new Date()).getTime();
    if (cond.dateRange.from && new Date(cond.dateRange.from).getTime() > t) return false;
    if (cond.dateRange.to && new Date(cond.dateRange.to).getTime() < t) return false;
  }
  return true;
}

/**
 * Section-level lifecycle gate. `published`/undefined render; `draft` · `review`
 * · `approved` · `scheduled` render only in preview; `archived` never.
 * (Expired is expressed via `renderIf.dateRange.to` passing.)
 */
export function isSectionPublished(
  status: LifecycleStatus | undefined,
  preview?: boolean,
): boolean {
  if (!status || status === "published") return true;
  if (status === "archived") return false;
  return Boolean(preview);
}
