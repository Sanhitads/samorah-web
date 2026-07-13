import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A wishlist entry — minimal product essentials for later display. */
export interface WishlistItem {
  productId: string;
  slug: string;
  name: string;
  price: number;
  gradClass?: string;
}

interface WishlistState {
  items: WishlistItem[];
  addToWishlist: (item: WishlistItem) => void;
  removeFromWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  clearWishlist: () => void;
  /** Replace the whole wishlist — used to hydrate from the cross-device account state. */
  setItems: (items: WishlistItem[]) => void;
}

/**
 * Minimal wishlist container — client-only, persisted to localStorage.
 * No UI, no backend, no Supabase sync, no account integration (those arrive in
 * the dedicated wishlist feature phase).
 */
export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],

      addToWishlist: (item) =>
        set((state) =>
          state.items.some((i) => i.productId === item.productId)
            ? state // already present — no duplicates
            : { items: [...state.items, item] },
        ),

      removeFromWishlist: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        })),

      isWishlisted: (productId) =>
        get().items.some((i) => i.productId === productId),

      clearWishlist: () => set({ items: [] }),

      setItems: (items) => set({ items }),
    }),
    {
      name: "samorah_wishlist",
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
