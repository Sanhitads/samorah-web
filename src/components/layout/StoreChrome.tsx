"use client";

import { Header } from "./Header";
import { MegaMenu } from "./MegaMenu";
import { SearchOverlay } from "./SearchOverlay";
import { useUIStore } from "@/store/useUIStore";

/**
 * Client chrome coordinator (Phase 6).
 *
 * Bridges the UI store to the isolated, prop-driven Header and overlays so none
 * couple to each other. The Cart Drawer (Component 5) wires its open-state here
 * as it lands.
 */
export function StoreChrome() {
  const menuOpen = useUIStore((s) => s.menuOpen);
  const openMenu = useUIStore((s) => s.openMenu);
  const closeMenu = useUIStore((s) => s.closeMenu);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const openSearch = useUIStore((s) => s.openSearch);
  const closeSearch = useUIStore((s) => s.closeSearch);

  return (
    <>
      <Header
        menuOpen={menuOpen}
        onMenuClick={openMenu}
        onSearchClick={openSearch}
      />
      <MegaMenu open={menuOpen} onClose={closeMenu} />
      <SearchOverlay open={searchOpen} onClose={closeSearch} />
    </>
  );
}
