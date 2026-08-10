"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { readSavedWindow, saveWindow } from "@/lib/analytics/savedFilters";

/**
 * AnalyticsNav (Milestone 2 · Stage 3) — the sticky navigation + filter toolbar for /admin/analytics.
 * Provides: a sticky date/window selector that REMEMBERS the last choice (saved-filter store), section
 * jump links with smooth scrolling, and refresh controls (manual + auto) with a last-updated stamp.
 * No redesign — reuses the existing ff-queue / ff-btn idioms. Client component (interactivity only);
 * all data still comes from the server page.
 */
export interface JumpSection {
  id: string;
  label: string;
}

export function AnalyticsNav({
  window: win,
  windows,
  sections,
}: {
  window: string;
  windows: { k: string; l: string }[];
  sections: JumpSection[];
}) {
  const router = useRouter();
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const didInit = useRef(false);

  // Remember last range: with no explicit ?window, restore the saved one; otherwise persist the current.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("window")) {
      const saved = readSavedWindow();
      if (saved && saved !== win) {
        router.replace(`/admin/analytics?window=${saved}`);
        return;
      }
    }
    saveWindow(win);
    setLastRefreshed(Date.now());
  }, [win, router]);

  const pickWindow = (k: string) => {
    saveWindow(k);
    router.push(`/admin/analytics?window=${k}`);
  };

  // router.refresh() inside a transition → isRefreshing stays true until the server re-render completes,
  // driving a lightweight spinner/pending state on the button.
  const refresh = useCallback(() => {
    startRefresh(() => router.refresh());
    setLastRefreshed(Date.now());
  }, [router]);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, [auto, refresh]);

  const jump = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  const updatedLabel = lastRefreshed
    ? new Date(lastRefreshed).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <nav className="an-nav" aria-label="Analytics navigation and filters">
      <div className="an-nav__row">
        <div className="an-nav__dates" role="group" aria-label="Time window">
          {windows.map((w) => (
            <button key={w.k} type="button" className="ff-queue an-date" data-active={win === w.k ? "1" : "0"} aria-pressed={win === w.k} onClick={() => pickWindow(w.k)}>
              {w.l}
            </button>
          ))}
        </div>
        <div className="an-nav__refresh">
          <span className="admin__muted an-updated" aria-live="polite">Updated {updatedLabel}</span>
          <button type="button" className="ff-btn ff-btn--mini" onClick={refresh} disabled={isRefreshing} aria-busy={isRefreshing} aria-label="Refresh analytics now">
            <span className={`an-refresh-ic${isRefreshing ? " an-refresh-ic--spin" : ""}`} aria-hidden="true">↻</span> {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          <label className="an-auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto</label>
        </div>
      </div>
      <div className="an-nav__jumps" role="group" aria-label="Jump to section">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="an-jump" onClick={(e) => jump(e, s.id)}>{s.label}</a>
        ))}
      </div>
    </nav>
  );
}
