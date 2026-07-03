import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BUNDLE_SIZE } from "@/lib/bundle";

/**
 * A candle held in the in-progress Discovery Composition — lean enough to render
 * the composer panel and to add the completed set to the cart, carrying the full
 * 100g price for the chosen vessel (the 15% is applied later as a cart-level
 * promotion).
 */
export interface CompositionItem {
  id: string;
  slug: string;
  name: string;
  chapterLabel?: string; // "Vol. I — Dessert Chapter"
  edition?: string; // "VOL. I.1"
  image: string; // url or "gradient:*"
  vessel: string; // enum — "glass" | "ceramic"
  size: string; // "100g"
  price: number; // full unit price for that vessel
}

export interface CompositionState {
  vessel: string | null;
  items: CompositionItem[];
  /** The cart compositionId being edited (null = building a new composition). */
  editingId: string | null;
  /** Choose (or switch) the vessel — switching clears the composition (no mixing). */
  setVessel: (vessel: string) => void;
  /** Add a candle if it fits the vessel, isn't a duplicate, and the set isn't full. */
  addCandle: (item: CompositionItem) => void;
  removeCandle: (id: string) => void;
  /** Load an existing cart composition into the composer to edit in place. */
  loadComposition: (vessel: string, items: CompositionItem[], editingId?: string | null) => void;
  /** Empty the selection + exit edit mode (after committing, or discarding). */
  clear: () => void;
}

/**
 * Composition store — the single source of truth for the in-progress Discovery
 * Composition, shared between the /bundles composer and the PDP "Add to
 * Composition" action, and persisted so it survives a refresh. Distinct from the
 * cart: this is the *building* stage; adding to the cart is the commitment.
 */
export const useCompositionStore = create<CompositionState>()(
  persist(
    (set) => ({
      vessel: null,
      items: [],
      editingId: null,

      setVessel: (vessel) =>
        set((state) => (vessel === state.vessel ? state : { vessel, items: [] })),

      addCandle: (item) =>
        set((state) => {
          const vessel = state.vessel ?? item.vessel;
          if (item.vessel !== vessel) return state; // no mixing vessels
          if (state.items.length >= BUNDLE_SIZE) return state; // full
          if (state.items.some((i) => i.id === item.id)) return state; // no duplicates
          return { vessel, items: [...state.items, item] };
        }),

      removeCandle: (id) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

      loadComposition: (vessel, items, editingId = null) =>
        set({ vessel, items: items.slice(0, BUNDLE_SIZE), editingId }),

      clear: () => set({ items: [], editingId: null }),
    }),
    {
      name: "samorah_composition",
      partialize: (state) => ({ vessel: state.vessel, items: state.items, editingId: state.editingId }),
    },
  ),
);

export const selectCompositionCount = (s: CompositionState) => s.items.length;
export const selectCompositionComplete = (s: CompositionState) => s.items.length === BUNDLE_SIZE;
