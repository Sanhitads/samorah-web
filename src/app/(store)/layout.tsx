import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { StoreChrome } from "@/components/layout/StoreChrome";
import { Footer } from "@/components/layout/Footer";
import { getSiteSettings } from "@/services/siteSettingsService";

/**
 * Storefront chrome wrapper (Phase 6 — Layout Chrome, complete).
 *
 * Wraps every storefront route with the editorial chrome. Auth pages
 * (/login, /register) live outside this group and stay chrome-free; admin
 * gets its own group (so Maintenance Mode locks the STOREFRONT only — /admin
 * stays reachable to turn it back off).
 *   1. AnnouncementBar · 2. Header · 3–5 Mega Menu/Search/Cart · 6. Footer
 */
export default async function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settings = await getSiteSettings();

  // Maintenance mode (R14) — storefront-only lockout; admin remains accessible.
  if (settings.maintenance.enabled) {
    return (
      <main className="sys-page">
        <p className="sys-page__eyebrow">{settings.brand.name}</p>
        <h1 className="sys-page__title">A brief pause.</h1>
        <p className="sys-page__body">{settings.maintenance.message}</p>
      </main>
    );
  }

  return (
    <>
      {settings.storeNotice.active && settings.storeNotice.text ? (
        <div className="store-notice" role="status">{settings.storeNotice.text}</div>
      ) : null}
      <AnnouncementBar />
      <StoreChrome />
      {children}
      <Footer />
    </>
  );
}
