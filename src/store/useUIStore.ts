import { create } from "zustand";

/**
 * Overlay UI state — the single source of truth for which storefront overlay is
 * open (Mega Menu, Search, Cart). Kept separate from data stores so any
 * component (the Header now, an add-to-cart button later) can open an overlay
 * without prop-drilling, and so the cart's open-state coordinates with the
 * others here rather than in the cart data store.
 *
 * Opening one overlay closes the others — only one fullscreen surface at a time.
 * Not persisted — ephemeral.
 */
interface UIState {
  menuOpen: boolean;
  searchOpen: boolean;
  cartOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  openCart: () => void;
  closeCart: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  menuOpen: false,
  searchOpen: false,
  cartOpen: false,
  openMenu: () => set({ menuOpen: true, searchOpen: false, cartOpen: false }),
  closeMenu: () => set({ menuOpen: false }),
  toggleMenu: () =>
    set((state) => ({ menuOpen: !state.menuOpen, searchOpen: false, cartOpen: false })),
  openSearch: () => set({ searchOpen: true, menuOpen: false, cartOpen: false }),
  closeSearch: () => set({ searchOpen: false }),
  openCart: () => set({ cartOpen: true, menuOpen: false, searchOpen: false }),
  closeCart: () => set({ cartOpen: false }),
}));
