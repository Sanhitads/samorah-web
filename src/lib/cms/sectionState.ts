/**
 * Per-section lifecycle state for composed pages (Homepage Builder · Phase 2 · point 7). Stored inside
 * a section's `settings` under reserved `__` keys, because the composer's sanitize preserves `settings`
 * verbatim but strips extra top-level fields. Section components ignore these keys (not schema fields).
 *
 * States: visible (live) · hidden (kept, off) · scheduled (live within a window) · archived (retired).
 * `enabled` on the section stays the master on/off the composer already validates; scheduling adds a
 * request-time gate on top (the homepage is force-dynamic, so the window is evaluated per request).
 */
export type SectionState = "visible" | "hidden" | "scheduled" | "archived";

const STATES: SectionState[] = ["visible", "hidden", "scheduled", "archived"];

export function sectionState(settings: Record<string, unknown> | undefined | null): SectionState {
  const s = settings?.__state;
  return typeof s === "string" && (STATES as string[]).includes(s) ? (s as SectionState) : "visible";
}

/** Should a section's schedule allow it to show *now*? Only "scheduled" sections are gated; everything
 *  else passes (so an un-scheduled/legacy section renders exactly as before). */
export function sectionScheduleOk(settings: Record<string, unknown> | undefined | null, now: number = Date.now()): boolean {
  if (sectionState(settings) !== "scheduled") return true;
  const from = Date.parse(String(settings?.__from ?? ""));
  const until = Date.parse(String(settings?.__until ?? ""));
  if (!Number.isNaN(from) && now < from) return false;
  if (!Number.isNaN(until) && now > until) return false;
  return true;
}

/** `enabled` derived from a chosen state — visible & scheduled are "on"; hidden & archived are "off". */
export function enabledForState(state: SectionState): boolean {
  return state === "visible" || state === "scheduled";
}

// The DISPLAYED publishing state of a section (point 12) — richer than the authoring state: a scheduled
// section reads Scheduled (before its window) or Expired (after it), and a live section reads Published
// only when its content matches what's live and has no pending edits; otherwise Draft.
export type EffectiveState = "published" | "draft" | "hidden" | "scheduled" | "expired" | "archived";

export function effectiveSectionState(
  settings: Record<string, unknown> | undefined | null,
  opts: { publishStatus?: "published" | "changed" | "new"; dirty?: boolean; now?: number } = {},
): EffectiveState {
  const st = sectionState(settings);
  const now = opts.now ?? Date.now();
  if (st === "hidden") return "hidden";
  if (st === "archived") return "archived";
  if (st === "scheduled") {
    const until = Date.parse(String(settings?.__until ?? ""));
    if (!Number.isNaN(until) && now > until) return "expired";
    const from = Date.parse(String(settings?.__from ?? ""));
    if (!Number.isNaN(from) && now < from) return "scheduled";
    // within the window → treated like a live section below
  }
  return opts.publishStatus === "published" && !opts.dirty ? "published" : "draft";
}
