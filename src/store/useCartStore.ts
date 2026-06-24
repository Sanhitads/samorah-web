import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Minimal product shape the cart needs (matches the prototype's addItem input). */
export interface CartProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  gradClass?: string;
  chapterName?: string;
}

/** A cart line — identical fields to the prototype's CartContext item. */
export interface CartItem {
  key: string; // `${productId}-${vessel}-${size}`
  productId: string;
  slug: string;
  name: string;
  price: number;
  gradClass?: string;
  chapterName?: string;
  vessel: string;
  size: string;
  qty: number;
}

export interface CartState {
  items: CartItem[];
  addItem: (product: CartProduct, vessel: string, size: string) => void;
  removeItem: (key: string) => void;
  updateQty: (key: string, qty: number) => void;
  clearCart: () => void;
}

/**
 * Cart store — a 1:1 port of the prototype's CartContext (legacy/context/
 * CartContext.jsx) from React Context + useReducer to Zustand + persist.
 * Behavior is unchanged; only the architecture differs.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      // ADD: increment qty if the key already exists, else append with qty 1.
      // (Overlay open-state lives in useUIStore now; the prototype's auto-open-
      // on-add is re-wired at the add-to-cart call site in Phase 9 via openCart.)
      addItem: (product, vessel, size) =>
        set((state) => {
          const key = `${product.id}-${vessel}-${size}`;
          const existing = state.items.find((i) => i.key === key);
          const items = existing
            ? state.items.map((i) =>
                i.key === key ? { ...i, qty: i.qty + 1 } : i,
              )
            : [
                ...state.items,
                {
                  key,
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  price: product.price,
                  gradClass: product.gradClass,
                  chapterName: product.chapterName,
                  vessel,
                  size,
                  qty: 1,
                },
              ];
          return { items };
        }),

      removeItem: (key) =>
        set((state) => ({ items: state.items.filter((i) => i.key !== key) })),

      // Set qty for the key, then drop any line at qty <= 0 (prototype behavior).
      updateQty: (key, qty) =>
        set((state) => ({
          items: state.items
            .map((i) => (i.key === key ? { ...i, qty } : i))
            .filter((i) => i.qty > 0),
        })),

      clearCart: () => set({ items: [] }),
    }),
    {
      name: "samorah_cart", // same localStorage key as the prototype
      partialize: (state) => ({ items: state.items }), // persist only items
    },
  ),
);

/** Total item count (Σ qty). Read via the hydration-safe `useStore` hook. */
export const selectCartCount = (s: CartState) =>
  s.items.reduce((sum, i) => sum + i.qty, 0);

/** Cart subtotal (Σ price × qty). Read via the hydration-safe `useStore` hook. */
export const selectCartSubtotal = (s: CartState) =>
  s.items.reduce((sum, i) => sum + i.price * i.qty, 0);
