"use client";

import { Header } from "./Header";
import { MegaMenu } from "./MegaMenu";
import { useUIStore } from "@/store/useUIStore";

/**
 * Client chrome coordinator (Phase 6).
 *
 * Bridges the UI store to the isolated, prop-driven Header and Mega Menu so
 * neither couples to the other. The Search Overlay (Component 4) and Cart Drawer
 * (Component 5) wire their open-state here as they land.
 */
export function StoreChrome() {
  const menuOpen = useUIStore((s) => s.menuOpen);
  const openMenu = useUIStore((s) => s.openMenu);
  const closeMenu = useUIStore((s) => s.closeMenu);

  return (
    <>
      <Header menuOpen={menuOpen} onMenuClick={openMenu} />
      <MegaMenu open={menuOpen} onClose={closeMenu} />
    </>
  );
}
