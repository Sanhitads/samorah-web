"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Undo/redo state hook (Phase 8 · point 33). A drop-in for `useState` that keeps a bounded past/future
 * stack. `set` accepts a value or updater (like setState) plus an optional `coalesceKey`: consecutive
 * changes with the same key within ~1.2s collapse into ONE history entry (so typing in a field is one
 * undo step, not one-per-keystroke). Structural changes (add/remove/reorder) omit the key → each is its
 * own step. `reset` clears history (e.g. after loading a preset/revision fresh).
 */
export interface HistoryControls<T> { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; reset: (v: T) => void }

export function useHistoryState<T>(initial: T, opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 120;
  const [state, setState] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const coalesce = useRef<{ key: string | null; time: number }>({ key: null, time: 0 });
  const [, tick] = useState(0);
  const bump = () => tick((n) => n + 1);

  const set = useCallback((updater: T | ((prev: T) => T), coalesceKey?: string) => {
    setState((prev) => {
      const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
      if (Object.is(next, prev)) return prev;
      const now = Date.now();
      const c = coalesce.current;
      const merge = !!coalesceKey && c.key === coalesceKey && now - c.time < 1200;
      if (!merge) { past.current.push(prev); if (past.current.length > limit) past.current.shift(); }
      coalesce.current = { key: coalesceKey ?? null, time: now };
      future.current = [];
      bump();
      return next;
    });
  }, [limit]);

  const undo = useCallback(() => setState((prev) => { const p = past.current.pop(); if (p === undefined) return prev; future.current.push(prev); coalesce.current = { key: null, time: 0 }; bump(); return p; }), []);
  const redo = useCallback(() => setState((prev) => { const f = future.current.pop(); if (f === undefined) return prev; past.current.push(prev); coalesce.current = { key: null, time: 0 }; bump(); return f; }), []);
  const reset = useCallback((v: T) => { past.current = []; future.current = []; coalesce.current = { key: null, time: 0 }; setState(v); bump(); }, []);

  const controls: HistoryControls<T> = { undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, reset };
  return [state, set, controls] as const;
}
