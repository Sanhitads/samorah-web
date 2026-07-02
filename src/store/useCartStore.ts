import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BUNDLE_DISCOUNT, BUNDLE_SIZE, bundleUnitPrice } from "@/lib/bundle";

/** Minimal product shape the cart needs (matches the prototype's addItem input). */
export interface CartProduct {
  id: string;
  slug: string;
  name: string;
  price: number; // ALWAYS the full unit price — promotions are applied at cart level
  gradClass?: string;
  chapterName?: string;
  /** Tags a line as part of a Discovery Composition (a cart-level promotion). */
  compositionId?: string;
}

/** A cart line — identical fields to the prototype's CartContext item. */
export interface CartItem {
  key: string; // `${productId}-${vessel}-${size}` (+ compositionId when set)
  productId: string;
  slug: string;
  name: string;
  price: number; // full unit price (pre-discount)
  gradClass?: string;
  chapterName?: string;
  vessel: string;
  size: string;
  qty: number;
  compositionId?: string;
}

export interface CartState {
  items: CartItem[];
  addItem: (product: CartProduct, vessel: string, size: string) => void;
  removeItem: (key: string) => void;
  updateQty: (key: string, qty: number) => void;
  clearCart: () => void;
}

const lineKey = (id: string, vessel: string, size: string, compositionId?: string) =>
  `${id}-${vessel}-${size}${compositionId ? `-${compositionId}` : ""}`;

/**
 * Cart store — a port of the prototype's CartContext to Zustand + persist, now
 * with a cart-level PROMOTION model. Lines always carry the full price; the
 * Discovery Composition's 15% is recomputed from the cart (never baked into the
 * stored price), so the same discount flows into Checkout / GST / Razorpay /
 * order totals from a single source of truth.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      // ADD: increment qty if the key already exists, else append with qty 1.
      // Composition lines are keyed with their compositionId, so they stay a
      // distinct group and never merge with a normal purchase of the same variant.
      addItem: (product, vessel, size) =>
        set((state) => {
          const key = lineKey(product.id, vessel, size, product.compositionId);
          const existing = state.items.find((i) => i.key === key);
          const items = existing
            ? state.items.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i))
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
                  compositionId: product.compositionId,
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

/** Cart subtotal at FULL price (Σ price × qty), before any promotion. */
export const selectCartSubtotal = (s: CartState) =>
  s.items.reduce((sum, i) => sum + i.price * i.qty, 0);

/**
 * Discovery Composition discount — the cart-level promotion. A composition earns
 * its 15% only while it is still complete (all BUNDLE_SIZE lines present); remove
 * a candle and the discount lapses honestly. Computed per line via bundleUnitPrice
 * so the cart total always matches the composer's preview to the rupee.
 */
export const selectCompositionDiscount = (s: CartState) => {
  const groups = new Map<string, CartItem[]>();
  for (const i of s.items) {
    if (!i.compositionId) continue;
    const g = groups.get(i.compositionId) ?? [];
    g.push(i);
    groups.set(i.compositionId, g);
  }
  let discount = 0;
  for (const lines of groups.values()) {
    if (lines.length !== BUNDLE_SIZE) continue; // incomplete → no promotion
    for (const l of lines) discount += (l.price - bundleUnitPrice(l.price)) * l.qty;
  }
  return discount;
};

/** Whole-percent label for the composition promotion (for cart display). */
export const COMPOSITION_DISCOUNT_PCT = Math.round(BUNDLE_DISCOUNT * 100);

/** Cart total after promotions (subtotal − composition discount). */
export const selectCartTotal = (s: CartState) =>
  selectCartSubtotal(s) - selectCompositionDiscount(s);
