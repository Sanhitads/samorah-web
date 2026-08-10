import { isWidgetEnabled } from "@/lib/analytics/analyticsRegistry";
import { makeFreshness, cacheAgeLabel } from "@/lib/analytics/dataFreshness";

/**
 * DataFreshnessBar (Milestone 2 · Stage 3) — a lightweight, consistent "how fresh is each source" strip
 * for /admin/analytics, covering first-party (Orders) AND external/cached sources (GA4, Clarity). Reuses
 * the DataFreshness helpers; feature-flagged via the registry (system.dataFreshness). Server component.
 */
export interface FreshnessSource {
  label: string;
  available: boolean;
  fetchedAtMs: number | null;
  ttlMs?: number | null;
}

export function DataFreshnessBar({ sources }: { sources: FreshnessSource[] }) {
  if (!isWidgetEnabled("system.dataFreshness") || !sources.length) return null;
  return (
    <div className="an-fresh" role="group" aria-label="Data freshness">
      {sources.map((s) => {
        const f = makeFreshness(s.label, { available: s.available, fetchedAtMs: s.fetchedAtMs, ttlMs: s.ttlMs ?? null });
        const text = !s.available ? "unavailable" : s.fetchedAtMs != null ? cacheAgeLabel(s.fetchedAtMs) : "live";
        return (
          <span key={s.label} className="an-fresh__chip" data-status={f.status} title={`${s.label} — ${text}`}>
            <span className="an-fresh__dot" aria-hidden="true" />
            {s.label} · {text}
          </span>
        );
      })}
    </div>
  );
}
