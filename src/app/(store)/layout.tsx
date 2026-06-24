import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { Header } from "@/components/layout/Header";

/**
 * Storefront chrome wrapper (Phase 6 — Layout Chrome).
 *
 * Wraps every storefront route with the editorial chrome. Auth pages
 * (/login, /register) live outside this group and stay chrome-free; admin
 * (Phase 15) gets its own group. Components are added one at a time:
 *   1. AnnouncementBar  ✓
 *   2. Header           ✓  (solid mode; the homepage opts into `floating` in Phase 7)
 *   3. Mega Menu · 4. Search Overlay · 5. Cart Drawer   (wire the Header callbacks)
 *   6. Footer
 *
 * The Header is mounted without overlay/cart/auth handlers for now — those
 * callbacks are wired as Components 3–5 land. cartCount integrates with
 * useCartStore at Component 5.
 */
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AnnouncementBar />
      <Header />
      {children}
      {/* Footer mounts here (Phase 6 · component 6) */}
      {/* Global overlays: SearchOverlay, CartDrawer (Phase 6 · components 4–5) */}
    </>
  );
}
