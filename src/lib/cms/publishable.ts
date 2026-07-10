/**
 * Publishable Resource pattern (review point 14) — the ONE definition of "is this
 * live now?" and the draft/publish vocabulary shared by every CMS-managed resource
 * (pages, navigation, homepage, blog, email templates). Framework-agnostic + pure,
 * so it's safe to call from any service or component.
 *
 * The contract every publishable resource follows:
 *   - `draft`      — content being edited (what Preview shows)
 *   - `published`  — content that is live (what the storefront shows)
 *   - `status`     — draft | scheduled | published
 *   - publish_at / unpublish_at — the live window (evaluated at READ time, no cron)
 * plus revision history via the shared cms_revisions store.
 */

export type PublishStatus = "draft" | "scheduled" | "published";
export const PUBLISH_STATUSES: PublishStatus[] = ["draft", "scheduled", "published"];

/** The scheduling fields any publishable row carries (snake_case as stored). */
export interface PublishWindow {
  status: string;
  publish_at?: string | null;
  unpublish_at?: string | null;
}

/**
 * Is a resource live at `now`? The single source of truth for storefront visibility
 * across ALL resource types (pages, nav, homepage…). No cron: crossing publish_at
 * makes it live; crossing unpublish_at hides it — evaluated per request.
 *   published → live unless before publish_at or at/after unpublish_at
 *   scheduled → live only once now ≥ publish_at (and before unpublish_at)
 *   draft     → never live
 */
export function isLive(w: PublishWindow, now = Date.now()): boolean {
  const pub = w.publish_at ? Date.parse(w.publish_at) : null;
  const unpub = w.unpublish_at ? Date.parse(w.unpublish_at) : null;
  if (unpub !== null && now >= unpub) return false;
  if (w.status === "published") return pub === null || now >= pub;
  if (w.status === "scheduled") return pub !== null && now >= pub;
  return false;
}

/** Human summary for admin badges. */
export function publishState(w: PublishWindow, now = Date.now()): "live" | "scheduled" | "unpublished" | "draft" {
  if (isLive(w, now)) return "live";
  if (w.status === "scheduled") return "scheduled";
  if (w.status === "published") return "unpublished"; // published but outside its window
  return "draft";
}
