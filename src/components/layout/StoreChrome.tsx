"use client";

import { Header } from "./Header";
import { MegaMenu } from "./MegaMenu";
import { SearchOverlay } from "./SearchOverlay";
import { CartDrawer } from "./CartDrawer";
import { useUIStore } from "@/store/useUIStore";
import { useStore } from "@/hooks/useStore";
import {
  type CartState,
  selectCartCount,
  useCartStore,
} from "@/store/useCartStore";

/**
 * Client chrome coordinator (Phase 6).
 *
 * Bridges the UI store to the isolated, prop-driven Header and overlays so none
 * couple to each other. The cart badge count is read hydration-safely (the cart
 * store is persisted to localStorage).
 */
export function StoreChrome() {
  const menuOpen = useUIStore((s) => s.menuOpen);
  const openMenu = useUIStore((s) => s.openMenu);
  const closeMenu = useUIStore((s) => s.closeMenu);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const openSearch = useUIStore((s) => s.openSearch);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const cartOpen = useUIStore((s) => s.cartOpen);
  const openCart = useUIStore((s) => s.openCart);
  const closeCart = useUIStore((s) => s.closeCart);

  const cartCount = useStore<CartState, number>(useCartStore, selectCartCount);

  return (
    <>
      <Header
        menuOpen={menuOpen}
        onMenuClick={openMenu}
        onSearchClick={openSearch}
        onCartClick={openCart}
        cartCount={cartCount}
      />
      <MegaMenu open={menuOpen} onClose={closeMenu} />
      <SearchOverlay open={searchOpen} onClose={closeSearch} />
      <CartDrawer open={cartOpen} onClose={closeCart} />
    </>
  );
}
