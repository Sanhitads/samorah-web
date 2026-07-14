import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BUNDLE_DISCOUNT, BUNDLE_SIZE, bundleUnitPrice } from "@/lib/bundle";
import { trackAddToCart, trackRemoveFromCart } from "@/lib/analytics/events";
import type { AnalyticsItem } from "@/lib/analytics/types";

/** Map a cart line/product to the GA4 ecommerce item shape (no PII). */
const toAnalyticsItem = (p: { productId?: string; id?: string; slug?: string; name?: string; price?: number; chapterName?: string; vessel?: string; size?: string; qty?: number }): AnalyticsItem => ({
  item_id: p.productId ?? p.id ?? p.slug ?? "",
  item_name: p.name ?? "",
  item_category: p.chapterName,
  item_variant: [p.vessel, p.size].filter(Boolean).join(" · ") || undefined,
  price: p.price,
  quantity: p.qty ?? 1,
});

/** Minimal product shape the cart needs (matches the prototype's addItem input). */
export interface CartProduct {
  id: string;
  slug: string;
  name: string;
  price: number; // ALWAYS the full unit price — promotions are applied at cart level
  gradClass?: string;
  chapterName?: string; // "Vol. I — Dessert Chapter" (chapter label)
  edition?: string; // "NO. I.1" (candle) / "VOL. I.1" (air)
  hour?: string; // Air only — "09:20"
  productType?: string; // display label — "Room Spray" | "Linen Spray"
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
  chapterName?: string; // chapter label ("Vol. I — Dessert Chapter")
  edition?: string; // "NO. I.1" / "VOL. I.1"
  hour?: string; // Air only — "09:20"
  productType?: string; // "Room Spray" | "Linen Spray"
  vessel: string;
  size: string;
  qty: number;
  compositionId?: string;
  /** Epoch ms of the last change to this line — drives last-write-wins cross-device merge. */
  updatedAt?: number;
}

export interface CartState {
  items: CartItem[];
  /** Deletion tombstones (lineKey → epoch ms) — drive cross-device deletion sync. */
  tombstones: Record<string, number>;
  addItem: (product: CartProduct, vessel: string, size: string) => void;
  removeItem: (key: string) => void;
  updateQty: (key: string, qty: number) => void;
  clearCart: () => void;
  /** Replace the whole cart — used to hydrate from the cross-device account state. */
  setItems: (items: CartItem[]) => void;
  setTombstones: (t: Record<string, number>) => void;
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
      tombstones: {},

      // ADD: increment qty if the key already exists, else append with qty 1.
      // Composition lines are keyed with their compositionId, so they stay a
      // distinct group and never merge with a normal purchase of the same variant.
      addItem: (product, vessel, size) =>
        set((state) => {
          const key = lineKey(product.id, vessel, size, product.compositionId);
          const existing = state.items.find((i) => i.key === key);
          const now = Date.now();
          const items = existing
            ? state.items.map((i) => (i.key === key ? { ...i, qty: i.qty + 1, updatedAt: now } : i))
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
                  edition: product.edition,
                  hour: product.hour,
                  productType: product.productType,
                  vessel,
                  size,
                  qty: 1,
                  compositionId: product.compositionId,
                  updatedAt: now,
                },
              ];
          // Re-adding a line clears its tombstone (revive).
          const { [key]: _drop, ...tombstones } = state.tombstones;
          trackAddToCart(toAnalyticsItem({ ...product, vessel, size, qty: 1 }));
          return { items, tombstones };
        }),

      removeItem: (key) =>
        set((state) => {
          const line = state.items.find((i) => i.key === key);
          if (line) trackRemoveFromCart(toAnalyticsItem(line));
          return { items: state.items.filter((i) => i.key !== key), tombstones: { ...state.tombstones, [key]: Date.now() } };
        }),

      // Set qty for the key, then drop any line at qty <= 0 (prototype behavior).
      updateQty: (key, qty) =>
        set((state) => {
          const items = state.items.map((i) => (i.key === key ? { ...i, qty, updatedAt: Date.now() } : i)).filter((i) => i.qty > 0);
          const removed = qty <= 0 && state.items.some((i) => i.key === key);
          return { items, tombstones: removed ? { ...state.tombstones, [key]: Date.now() } : state.tombstones };
        }),

      clearCart: () => {
        const now = Date.now();
        set((state) => ({ items: [], tombstones: { ...state.tombstones, ...Object.fromEntries(state.items.map((i) => [i.key, now])) } }));
      },

      setItems: (items) => set({ items }),
      setTombstones: (t) => set({ tombstones: t }),
    }),
    {
      name: "samorah_cart", // same localStorage key as the prototype
      partialize: (state) => ({ items: state.items, tombstones: state.tombstones }),
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
