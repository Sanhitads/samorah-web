/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Section analytics service (Phase 6 · point 26) — first-party, privacy-first per-section metrics for
 * composable pages. The storefront posts anonymous events (view / click / scroll / conversion) to the
 * ingest endpoint, which calls `recordSectionEvents` (service-role). The builder reads per-section
 * rollups via `getSectionAnalytics` (a stable SQL aggregation function). No PII, no cross-site cookies —
 * events carry only an ephemeral per-tab session id used to de-dupe views.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type SectionEventType = "view" | "click" | "scroll" | "conversion";
export interface SectionEventInput {
  pageKey?: string; sectionId: string; sectionType?: string;
  eventType: SectionEventType; sessionId?: string; scrollPct?: number; path?: string;
}
export interface SectionStat { views: number; clicks: number; conversions: number; avgScroll: number; ctr: number }

const TYPES = new Set<SectionEventType>(["view", "click", "scroll", "conversion"]);
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);

/** Validate + normalise a batch of raw events into DB rows (capped at 50, invalid dropped). Pure. */
export function normalizeEvents(events: SectionEventInput[]): Record<string, unknown>[] {
  if (!Array.isArray(events)) return [];
  return events.slice(0, 50)
    .filter((e) => e && typeof e.sectionId === "string" && e.sectionId && TYPES.has(e.eventType))
    .map((e) => ({
      page_key: clip(e.pageKey, 60) || "homepage",
      section_id: clip(e.sectionId, 120)!,
      section_type: clip(e.sectionType, 60) ?? null,
      event_type: e.eventType,
      session_id: clip(e.sessionId, 64) ?? null,
      scroll_pct: e.eventType === "scroll" && typeof e.scrollPct === "number" ? Math.max(0, Math.min(100, Math.round(e.scrollPct))) : null,
      path: clip(e.path, 200) ?? null,
    }));
}

/** Insert a batch of storefront events (validated + capped). Called only from the server ingest route. */
export async function recordSectionEvents(events: SectionEventInput[]): Promise<{ ok: boolean; inserted: number; reason?: string }> {
  if (!Array.isArray(events)) return { ok: false, inserted: 0, reason: "events[] required" };
  const rows = normalizeEvents(events);
  if (!rows.length) return { ok: true, inserted: 0 };
  try {
    const db = createAdminClient() as any;
    const { error } = await db.from("section_events").insert(rows);
    if (error) return { ok: false, inserted: 0, reason: error.message };
    return { ok: true, inserted: rows.length };
  } catch (e) {
    return { ok: false, inserted: 0, reason: e instanceof Error ? e.message : "insert failed" };
  }
}

/** Per-section rollup (views/clicks/conversions/avgScroll + derived CTR) over the last `days`. Returns
 *  a map keyed by section id. Empty map on any error / before the migration is applied (resilient). */
export async function getSectionAnalytics(pageKey: string, days = 30): Promise<Record<string, SectionStat>> {
  try {
    const db = createAdminClient() as any;
    const { data, error } = await db.rpc("section_analytics", { p_page_key: pageKey, p_days: days });
    if (error || !Array.isArray(data)) return {};
    const out: Record<string, SectionStat> = {};
    for (const r of data) {
      const views = Number(r.views ?? 0), clicks = Number(r.clicks ?? 0);
      out[r.section_id] = {
        views, clicks, conversions: Number(r.conversions ?? 0),
        avgScroll: r.avg_scroll != null ? Number(r.avg_scroll) : 0,
        ctr: views > 0 ? clicks / views : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}
