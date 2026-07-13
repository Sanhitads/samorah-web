"use client";

import { useEffect, useRef } from "react";
import { useUserStore } from "@/store/useUserStore";
import { useCartStore, type CartItem } from "@/store/useCartStore";
import { useWishlistStore, type WishlistItem } from "@/store/useWishlistStore";

/**
 * Cross-device account sync (mount once in the storefront chrome). While signed in,
 * the cart + wishlist follow the user to any device: on sign-in we MERGE the local
 * (guest) state with the server state and hydrate both stores, then push every
 * subsequent change (debounced). Loyalty points + order history already live on the
 * user server-side, so they sync without any client work.
 */

/** Cart merge — union by line key; on a clash keep the larger quantity (never doubles). */
function mergeCart(local: CartItem[], remote: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const it of [...remote, ...local]) {
    const prev = map.get(it.key);
    map.set(it.key, prev ? { ...it, qty: Math.max(prev.qty, it.qty) } : it);
  }
  return [...map.values()];
}
/** Wishlist merge — union by product id. */
function mergeWishlist(local: WishlistItem[], remote: WishlistItem[]): WishlistItem[] {
  const map = new Map<string, WishlistItem>();
  for (const it of [...remote, ...local]) map.set(it.productId, it);
  return [...map.values()];
}

export function AccountSync() {
  const userId = useUserStore((s) => s.user?.id ?? null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ready = useRef(false); // don't push until the initial merge has hydrated

  useEffect(() => {
    if (!userId) return;
    ready.current = false;
    let alive = true;

    const push = async () => {
      try {
        await fetch("/api/account/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cart: useCartStore.getState().items, wishlist: useWishlistStore.getState().items }),
        });
      } catch { /* retry on next change */ }
    };
    const schedulePush = () => {
      if (!ready.current) return;
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(push, 1500);
    };

    // 1. Merge local ⊕ server on sign-in, then hydrate both stores + persist the merge.
    (async () => {
      try {
        const res = await fetch("/api/account/sync");
        const remote = res.ok ? await res.json() : { cart: [], wishlist: [] };
        if (!alive) return;
        const mergedCart = mergeCart(useCartStore.getState().items, remote.cart ?? []);
        const mergedWish = mergeWishlist(useWishlistStore.getState().items, remote.wishlist ?? []);
        useCartStore.getState().setItems(mergedCart);
        useWishlistStore.getState().setItems(mergedWish);
        await push();
      } catch { /* leave local state intact on failure */ }
      finally { if (alive) ready.current = true; }
    })();

    // 2. Push subsequent local changes (debounced) while signed in.
    const unsubCart = useCartStore.subscribe(schedulePush);
    const unsubWish = useWishlistStore.subscribe(schedulePush);

    return () => {
      alive = false;
      if (pushTimer.current) clearTimeout(pushTimer.current);
      unsubCart(); unsubWish();
    };
  }, [userId]);

  return null;
}
