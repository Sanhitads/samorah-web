"use client";

import { useEffect, useState } from "react";

export interface WidgetDef { key: string; label: string }

const STORAGE_KEY = "samorah_dash_hidden";

/**
 * Dashboard personalization (review point 15). A lightweight "Customize" control that
 * lets each admin hide/show dashboard widgets, persisted per-browser in localStorage.
 * It toggles visibility of server-rendered sections tagged `[data-widget]` — no schema,
 * no re-render of the data. Full drag-reorder is a documented future enhancement.
 */
export function DashboardPersonalize({ widgets }: { widgets: WidgetDef[] }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  // Load saved prefs once, then apply.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setHidden(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  // Apply to the DOM whenever the hidden set changes (after initial load).
  useEffect(() => {
    if (!ready) return;
    for (const w of widgets) {
      const el = document.querySelector<HTMLElement>(`[data-widget="${w.key}"]`);
      if (el) el.style.display = hidden.has(w.key) ? "none" : "";
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden])); } catch { /* ignore */ }
  }, [hidden, ready, widgets]);

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <div className="cc-personalize">
      <button type="button" className="cc-personalize__btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        ⚙ Customize{hidden.size ? ` · ${hidden.size} hidden` : ""}
      </button>
      {open ? (
        <div className="cc-personalize__panel" role="menu">
          <p className="cc-personalize__title">Show widgets</p>
          {widgets.map((w) => (
            <label key={w.key} className="cc-personalize__row">
              <input type="checkbox" checked={!hidden.has(w.key)} onChange={() => toggle(w.key)} />
              <span>{w.label}</span>
            </label>
          ))}
          {hidden.size ? <button type="button" className="cc-personalize__reset" onClick={() => setHidden(new Set())}>Reset all</button> : null}
        </div>
      ) : null}
    </div>
  );
}
