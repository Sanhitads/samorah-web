import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { StoreChrome } from "@/components/layout/StoreChrome";

/**
 * Storefront chrome wrapper (Phase 6 — Layout Chrome).
 *
 * Wraps every storefront route with the editorial chrome. Auth pages
 * (/login, /register) live outside this group and stay chrome-free; admin
 * (Phase 15) gets its own group. Components are added one at a time:
 *   1. AnnouncementBar  ✓
 *   2. Header           ✓  (solid mode; the homepage opts into `floating` in Phase 7)
 *   3. Mega Menu        ✓  (StoreChrome bridges the UI store → Header + Mega Menu)
 *   4. Search Overlay · 5. Cart Drawer   (extend StoreChrome / useUIStore)
 *   6. Footer
 */
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AnnouncementBar />
      <StoreChrome />
      {children}
      {/* Footer mounts here (Phase 6 · component 6) */}
    </>
  );
}
