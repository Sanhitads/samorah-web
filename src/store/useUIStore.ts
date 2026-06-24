import { create } from "zustand";

/**
 * Overlay UI state — the single source of truth for which storefront overlay is
 * open. Kept separate from data stores so any component (Header now, an
 * add-to-cart button later) can open an overlay without prop-drilling.
 *
 * Opening one overlay closes the others — only one fullscreen surface at a time.
 * Cart (Component 5) extends this with cartOpen. Not persisted — ephemeral.
 */
interface UIState {
  menuOpen: boolean;
  searchOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
  openSearch: () => void;
  closeSearch: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  menuOpen: false,
  searchOpen: false,
  openMenu: () => set({ menuOpen: true, searchOpen: false }),
  closeMenu: () => set({ menuOpen: false }),
  toggleMenu: () => set((state) => ({ menuOpen: !state.menuOpen, searchOpen: false })),
  openSearch: () => set({ searchOpen: true, menuOpen: false }),
  closeSearch: () => set({ searchOpen: false }),
}));
