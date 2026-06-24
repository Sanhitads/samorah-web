import { AnnouncementBar } from "@/components/layout/AnnouncementBar";

/**
 * Storefront chrome wrapper (Phase 6 — Layout Chrome).
 *
 * Wraps every storefront route with the editorial chrome. Auth pages
 * (/login, /register) live outside this group and stay chrome-free; admin
 * (Phase 15) gets its own group. Components are added one at a time:
 *   1. AnnouncementBar  ✓
 *   2. Header + Mega Menu   (next)
 *   3. Search Overlay · 4. Cart Drawer   (global overlays)
 *   6. Footer
 */
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AnnouncementBar />
      {/* Header + Mega Menu mount here (Phase 6 · component 2) */}
      {children}
      {/* Footer mounts here (Phase 6 · component 6) */}
      {/* Global overlays: SearchOverlay, CartDrawer (Phase 6 · components 4–5) */}
    </>
  );
}
