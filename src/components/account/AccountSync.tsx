"use client";

import { useEffect, useRef } from "react";
import { useUserStore } from "@/store/useUserStore";
import { useCartStore, type CartItem } from "@/store/useCartStore";
import { useWishlistStore, type WishlistItem } from "@/store/useWishlistStore";
import { mergeCart, mergeWishlist } from "@/lib/account/merge";
import { track } from "@/lib/analytics/events";

/**
 * Cross-device account sync (mount once in the storefront chrome). While signed in,
 * the cart + wishlist follow the user to any device: on sign-in we MERGE the local
 * (guest) state with the server state (last-write-wins per line) and adopt the server's
 * merged result, then push every subsequent change (debounced; the server re-merges so
 * concurrent devices converge). Loyalty points + order history already live on the user
 * server-side, so they sync without any client work.
 */
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

    // 1. Merge local ⊕ server on sign-in; adopt the server's authoritative merged result.
    (async () => {
      try {
        const localCart = useCartStore.getState().items;
        const localWish = useWishlistStore.getState().items;
        const res = await fetch("/api/account/sync");
        const remote = res.ok ? await res.json() : { cart: [], wishlist: [] };
        if (!alive) return;
        // POST our local state; the server merges with stored and returns the result.
        const posted = await fetch("/api/account/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cart: localCart, wishlist: localWish }),
        });
        const merged = posted.ok ? await posted.json() : null;
        if (!alive) return;
        const cart = (merged?.cart ?? mergeCart(localCart as any, remote.cart ?? [])) as CartItem[]; // eslint-disable-line @typescript-eslint/no-explicit-any
        const wish = (merged?.wishlist ?? mergeWishlist(localWish as any, remote.wishlist ?? [])) as WishlistItem[]; // eslint-disable-line @typescript-eslint/no-explicit-any
        useCartStore.getState().setItems(cart);
        useWishlistStore.getState().setItems(wish);
        const gained = cart.length > localCart.length || wish.length > localWish.length;
        if (gained) { track("cart_merge_occurred", { lines: cart.length }); track("wishlist_merge_occurred", { items: wish.length }); }
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
