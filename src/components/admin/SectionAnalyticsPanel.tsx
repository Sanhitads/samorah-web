"use client";

import { useState } from "react";
import type { SectionStat } from "@/services/analytics/sectionAnalyticsService";

/**
 * Section analytics (Phase 6 · point 26) — a builder panel showing per-section Views / CTR / Scroll % /
 * Clicks / Conversions over the last N days, from first-party privacy-first tracking on the live page.
 * Read-only; keyed by section id so it lines up with the section list above.
 */
const pct = (n: number) => `${Math.round(n * 100)}%`;
const num = (n: number) => n.toLocaleString();

export function SectionAnalyticsPanel({ stats, sections, days = 30 }: {
  stats: Record<string, SectionStat>; sections: { id: string; type: string; label: string }[]; days?: number;
}) {
  const [open, setOpen] = useState(false);
  const rows = sections.map((s) => ({ ...s, stat: stats[s.id] }));
  const totalViews = Object.values(stats).reduce((a, s) => a + s.views, 0);
  const hasData = totalViews > 0;

  return (
    <div className="hp-seo hp-analytics">
      <button type="button" className="hp-seo__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{open ? "▾" : "▸"} Section analytics</span>
        <span className="admin__muted">{hasData ? `${num(totalViews)} views · last ${days} days` : `no data yet · last ${days} days`}</span>
      </button>
      {open ? (
        <div className="hp-analytics__body">
          <div className="hp-analytics__scroll">
            <table className="admin__table admin__table--board hp-analytics__table">
              <thead><tr><th>Section</th><th>Views</th><th>CTR</th><th>Scroll</th><th>Clicks</th><th>Conversions</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label} <span className="admin__muted">· {r.type}</span></td>
                    <td className="admin__mono">{r.stat ? num(r.stat.views) : "—"}</td>
                    <td className="admin__mono">{r.stat && r.stat.views ? pct(r.stat.ctr) : "—"}</td>
                    <td className="admin__mono">{r.stat && r.stat.avgScroll ? `${Math.round(r.stat.avgScroll)}%` : "—"}</td>
                    <td className="admin__mono">{r.stat ? num(r.stat.clicks) : "—"}</td>
                    <td className="admin__mono">{r.stat ? num(r.stat.conversions) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cfg-hint">
            First-party &amp; privacy-first (consent-gated, no personal data). <b>Views</b> = section seen ≥50%;
            <b> CTR</b> = clicks ÷ views; <b>Scroll</b> = average depth reached; <b>Conversions</b> = add-to-cart
            attributed (last-touch) to the section clicked before it. {hasData ? "" : "Numbers appear once visitors browse the live homepage with analytics consent."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
