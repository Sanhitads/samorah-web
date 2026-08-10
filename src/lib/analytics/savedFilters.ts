/**
 * Saved analytics filters — ARCHITECTURE + localStorage implementation (Milestone 2 · Stage 3).
 *
 * `AnalyticsFilterState` is the ONE canonical shape for "what is the analytics view currently scoped to".
 * It is deliberately designed to serialize to BOTH storage backends AND, in a future stage, the URL query
 * string — without a redesign:
 *
 *   window  → `?window=30`          (time range)
 *   section → `?section=revenue` / `#revenue`   (active/deep-linked section — see analyticsRegistry ids)
 *   filters → `?f.status=paid&f.payment=cod`    (per-section filters, a flat string map)
 *   future custom params → add a typed optional field here (or nest under `filters`) — call sites unchanged.
 *
 * A URL-sync layer would just read/write these fields to `URLSearchParams`; the localStorage store and a
 * future user/DB-scoped store implement the same `SavedFilterStore` interface. `version` lets stored
 * preferences self-describe so the schema can evolve (bump `SAVED_FILTER_VERSION`; incompatible stored
 * state is dropped, never mis-read). No DB is introduced in this milestone.
 */
export const SAVED_FILTER_VERSION = 1;

export interface AnalyticsFilterState {
  /** Schema version of the stored preference. Bump on a breaking shape change. */
  version: number;
  /** Time window: "7" | "30" | "90" | "all" (mirrors the page ?window param). */
  window: string;
  /** Active/last-viewed section id (analyticsRegistry `ANALYTICS_SECTIONS`). Future deep-linking + search. */
  section?: string;
  /** Per-section filters as a flat string map (future URL sync: `?f.<key>=<value>`). */
  filters?: Record<string, string>;
}

export const DEFAULT_FILTER: AnalyticsFilterState = { version: SAVED_FILTER_VERSION, window: "30" };
const STORAGE_KEY = "samorah.analytics.filters.v1";

/** Storage seam — localStorage now; a DB/user-scoped store can implement the same interface later. */
export interface SavedFilterStore {
  read(): AnalyticsFilterState | null;
  write(state: AnalyticsFilterState): void;
}

export const localFilterStore: SavedFilterStore = {
  read() {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<AnalyticsFilterState>;
      // Drop preferences written by an incompatible (future) schema version rather than mis-reading them.
      if (parsed.version !== SAVED_FILTER_VERSION) return null;
      if (typeof parsed.window !== "string") return null;
      return {
        version: SAVED_FILTER_VERSION,
        window: parsed.window,
        section: typeof parsed.section === "string" ? parsed.section : undefined,
        filters: parsed.filters && typeof parsed.filters === "object" ? parsed.filters : undefined,
      };
    } catch {
      return null;
    }
  },
  write(state) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: SAVED_FILTER_VERSION }));
    } catch {
      /* private mode / quota — ignore */
    }
  },
};

/** Convenience helpers over the default (localStorage) store. */
export function readSavedWindow(store: SavedFilterStore = localFilterStore): string | null {
  return store.read()?.window ?? null;
}
export function saveWindow(w: string, store: SavedFilterStore = localFilterStore): void {
  store.write({ ...(store.read() ?? DEFAULT_FILTER), version: SAVED_FILTER_VERSION, window: w });
}
