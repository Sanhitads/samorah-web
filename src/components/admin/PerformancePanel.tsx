"use client";

import { useState } from "react";
import type { HomepagePerformance } from "@/services/analytics/performanceService";

/**
 * Performance meter (Phase 6 · point 27) — a builder panel estimating the page's image weight from the
 * media library: total weight, the largest image, the heaviest section, and an estimated load time on a
 * typical mobile connection. Deterministic (no tracking) — computed server-side from the current draft.
 */
const fmtBytes = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(2)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
// A rough homepage image-weight budget for luxury imagery (tune to taste).
const weightTone = (b: number) => (b > 3_000_000 ? "err" : b > 1_500_000 ? "warn" : "ok");

export function PerformancePanel({ perf, typeLabels }: { perf: HomepagePerformance; typeLabels: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const tone = weightTone(perf.totalBytes);
  const heaviest = perf.heaviestSection ? (typeLabels[perf.heaviestSection.type] ?? perf.heaviestSection.type) : "—";

  return (
    <div className="hp-seo hp-perf">
      <button type="button" className="hp-seo__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{open ? "▾" : "▸"} Performance meter</span>
        <span className="admin__muted">{fmtBytes(perf.totalBytes)} · ~{fmtMs(perf.estLoadMs)} to load</span>
      </button>
      {open ? (
        <div className="hp-perf__body">
          <div className="hp-perf__stats">
            <div className={`hp-perf__stat is-${tone}`}><span className="hp-perf__num">{fmtBytes(perf.totalBytes)}</span><span className="hp-perf__lbl">Homepage image weight</span></div>
            <div className="hp-perf__stat"><span className="hp-perf__num">{perf.largest ? fmtBytes(perf.largest.bytes) : "—"}</span><span className="hp-perf__lbl">Largest image{perf.largest ? ` · ${typeLabels[perf.largest.section] ?? perf.largest.section}` : ""}</span></div>
            <div className="hp-perf__stat"><span className="hp-perf__num">{heaviest}</span><span className="hp-perf__lbl">Heaviest section{perf.heaviestSection ? ` · ${fmtBytes(perf.heaviestSection.bytes)}` : ""}</span></div>
            <div className="hp-perf__stat"><span className="hp-perf__num">~{fmtMs(perf.estLoadMs)}</span><span className="hp-perf__lbl">Est. load time · ~{perf.assumedMbps} Mbps mobile</span></div>
          </div>
          <p className="cfg-hint">
            {perf.knownImages} sized image{perf.knownImages === 1 ? "" : "s"} from the Media Library
            {perf.unknownImages ? ` · ${perf.unknownImages} external image${perf.unknownImages === 1 ? "" : "s"} of unknown size (not counted)` : ""}.
            {tone === "err" ? " ⚠ Heavy — consider smaller masters or fewer image sections." : tone === "warn" ? " A little heavy for mobile — trim where you can." : " Looks lean."}
          </p>
          {perf.largest ? <p className="cfg-hint">Biggest file: <span className="admin__mono">{perf.largest.url.split("/").pop()}</span> ({fmtBytes(perf.largest.bytes)}). Re-upload a smaller web master if it's oversized.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
