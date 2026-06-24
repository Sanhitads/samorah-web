import { create } from "zustand";

/**
 * Overlay UI state — the single source of truth for which storefront overlay is
 * open. Kept separate from data stores so any component (Header now, an
 * add-to-cart button later) can open an overlay without prop-drilling.
 *
 * Phase 6 introduces the Mega Menu; Search (Component 4) and Cart (Component 5)
 * extend this same store with searchOpen / cartOpen. Opening one overlay closes
 * the others (only one fullscreen surface at a time).
 *
 * Not persisted — overlay state is ephemeral.
 */
interface UIState {
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  menuOpen: false,
  openMenu: () => set({ menuOpen: true }),
  closeMenu: () => set({ menuOpen: false }),
  toggleMenu: () => set((state) => ({ menuOpen: !state.menuOpen })),
}));
