/**
 * Analytics seam for the Luxury Experience Engine.
 *
 * Phase 1 is a NO-OP — it does not touch GA4 / GTM / Clarity and never emits events, so the
 * homepage's own analytics (page_view, scroll, engagement) are entirely unaffected. The event
 * names + `reportExperience()` are defined now so a future phase can wire them to the existing
 * `trackEvent` layer in one line, without changing any experience code.
 */
export const EXPERIENCE_EVENTS = {
  viewed: "luxury_experience_viewed",
  skipped: "luxury_experience_skipped",
  completed: "luxury_experience_completed",
} as const;

export type ExperiencePhase = keyof typeof EXPERIENCE_EVENTS;

/** No-op in Phase 1. FUTURE: dispatch EXPERIENCE_EVENTS[phase] through the existing analytics layer. */
export function reportExperience(_phase: ExperiencePhase, _detail?: Record<string, unknown>): void {
  /* intentionally does nothing — no analytics coupling in Phase 1 */
}
