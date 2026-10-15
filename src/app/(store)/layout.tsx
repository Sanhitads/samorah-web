import { cookies } from "next/headers";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { PromoBanner } from "@/components/layout/PromoBanner";
import { getPromoBanner } from "@/services/couponAdminService";
import { StoreChrome } from "@/components/layout/StoreChrome";
import { Footer } from "@/components/layout/Footer";
import { getSiteSettings } from "@/services/siteSettingsService";
import { ShippingConfigProvider } from "@/components/commerce/ShippingConfigProvider";
import { getNavigation, getFooterMeta } from "@/services/navigationService";
import { requireStaff } from "@/lib/auth/requireStaff";
import { ClearPreviewLink } from "@/components/page/ClearPreviewLink";
import { AccountSync } from "@/components/account/AccountSync";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteStructuredData } from "@/lib/seo/siteLd";

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
  // Independent reads run in parallel to cut TTFB (an LCP input): site settings + the cookie jar are
  // always needed up front (settings gates maintenance; the jar gates draft-nav preview).
  const [settings, jar] = await Promise.all([getSiteSettings(), cookies()]);

  // Maintenance mode (R14) — storefront-only lockout; admin remains accessible.
  // (Fetch nav only when the store actually renders — skip it during a lockout.)
  if (settings.maintenance.enabled) {
    return (
      <main className="sys-page">
        <p className="sys-page__eyebrow">{settings.brand.name}</p>
        <h1 className="sys-page__title">A brief pause.</h1>
        <p className="sys-page__body">{settings.maintenance.message}</p>
      </main>
    );
  }

  // Draft navigation preview (review point 3) — staff-only, gated by a short-lived
  // cookie set from the Navigation admin. Bypasses the nav cache to show the draft.
  let preview = false;
  if (jar.get("nav_preview")) preview = (await requireStaff("editor")).ok;
  // nav depends on `preview`; footer + banner are independent — fetch all three together (was serial).
  const [nav, footerMeta, banner] = await Promise.all([getNavigation({ preview }), getFooterMeta(), getPromoBanner()]);
  const showBanner = banner.enabled && !!banner.message;
  // Top-bar offset the FLOATING header + hero sit below. Each visible bar is 38px: the announcement
  // bar (unless hidden in Settings) + the promo banner when shown. Injected explicitly so hiding the
  // announcement bar correctly removes its 38px (no gap) — default stays 38px (announcement only).
  const topBars = (settings.announcement.hidden ? 0 : 38) + (showBanner ? 38 : 0);

  return (
    <ShippingConfigProvider freeShippingThresholdInr={settings.shipping.freeThreshold}>
      {/* Top-bars offset for the FLOATING header + hero — accounts for the announcement bar (unless
          hidden) and the promo banner (each 38px). Injected explicitly so hiding the bar removes its gap. */}
      <style dangerouslySetInnerHTML={{ __html: `:root{--top-bars:${topBars}px}` }} />
      {preview ? <div className="store-notice" role="status" style={{ background: "#8a3d2f", color: "#fff" }}>Previewing draft navigation — not live.{" "}<ClearPreviewLink cookie="nav_preview">Exit preview</ClearPreviewLink></div> : null}
      {settings.storeNotice.active && settings.storeNotice.text ? (
        <div className="store-notice" role="status">{settings.storeNotice.text}</div>
      ) : null}
      <JsonLd data={siteStructuredData({ description: settings.seo.defaultDescription || undefined })} />
      <AnnouncementBar announcement={settings.announcement} />
      <PromoBanner banner={banner} />
      <AccountSync />
      <StoreChrome branches={nav.branches} />
      {children}
      <Footer sections={nav.footer} poetic={footerMeta.poetic} copyright={footerMeta.copyright} madeIn={footerMeta.madeIn} />
    </ShippingConfigProvider>
  );
}
