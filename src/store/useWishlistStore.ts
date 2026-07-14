import { create } from "zustand";
import { persist } from "zustand/middleware";
import { trackAddToWishlist, trackRemoveFromWishlist } from "@/lib/analytics/events";

/** A wishlist entry — minimal product essentials for later display. */
export interface WishlistItem {
  productId: string;
  slug: string;
  name: string;
  price: number;
  gradClass?: string;
  /** Epoch ms of the last change — drives last-write-wins + tombstone deletion sync. */
  updatedAt?: number;
}

interface WishlistState {
  items: WishlistItem[];
  addToWishlist: (item: WishlistItem) => void;
  removeFromWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  clearWishlist: () => void;
  /** Replace the whole wishlist — used to hydrate from the cross-device account state. */
  setItems: (items: WishlistItem[]) => void;
  /** Deletion tombstones (productId → epoch ms) for cross-device deletion sync. */
  tombstones: Record<string, number>;
  setTombstones: (t: Record<string, number>) => void;
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
      tombstones: {},

      addToWishlist: (item) =>
        set((state) => {
          if (state.items.some((i) => i.productId === item.productId)) return state; // no duplicates
          const { [item.productId]: _drop, ...tombstones } = state.tombstones; // revive → clear tombstone
          trackAddToWishlist({ item_id: item.productId, item_name: item.name, price: item.price });
          return { items: [...state.items, { ...item, updatedAt: Date.now() }], tombstones };
        }),

      removeFromWishlist: (productId) =>
        set((state) => {
          const it = state.items.find((i) => i.productId === productId);
          if (it) trackRemoveFromWishlist({ item_id: it.productId, item_name: it.name, price: it.price });
          return {
            items: state.items.filter((i) => i.productId !== productId),
            tombstones: { ...state.tombstones, [productId]: Date.now() },
          };
        }),

      isWishlisted: (productId) =>
        get().items.some((i) => i.productId === productId),

      clearWishlist: () => set((state) => ({ items: [], tombstones: { ...state.tombstones, ...Object.fromEntries(state.items.map((i) => [i.productId, Date.now()])) } })),

      setItems: (items) => set({ items }),
      setTombstones: (t) => set({ tombstones: t }),
    }),
    {
      name: "samorah_wishlist",
      partialize: (state) => ({ items: state.items, tombstones: state.tombstones }),
    },
  ),
);
