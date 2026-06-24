import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { StoreChrome } from "@/components/layout/StoreChrome";
import { Footer } from "@/components/layout/Footer";

/**
 * Storefront chrome wrapper (Phase 6 — Layout Chrome, complete).
 *
 * Wraps every storefront route with the editorial chrome. Auth pages
 * (/login, /register) live outside this group and stay chrome-free; admin
 * (Phase 15) gets its own group.
 *   1. AnnouncementBar  ✓
 *   2. Header           ✓  (solid mode; the homepage opts into `floating` in Phase 7)
 *   3. Mega Menu · 4. Search Overlay · 5. Cart Drawer  ✓  (StoreChrome + useUIStore)
 *   6. Footer           ✓  (server component)
 */
export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AnnouncementBar />
      <StoreChrome />
      {children}
      <Footer />
    </>
  );
}
