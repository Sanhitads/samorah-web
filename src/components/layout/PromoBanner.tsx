import { getPromoBanner } from "@/services/couponAdminService";

/**
 * Storefront promotional strip — advertises a coupon (e.g. "Use SAVE10 for 10% off"). Visibility is
 * entirely the admin's call (the `enabled` toggle on /admin/coupons); when off, nothing renders. Server
 * component: reads the setting directly, no client JS, no flash. The highlighted code is shown in a
 * copy-friendly monospace chip; customers still type it at checkout.
 */
export async function PromoBanner() {
  const banner = await getPromoBanner();
  if (!banner.enabled || !banner.message) return null;
  return (
    <div className="promo-banner" role="note">
      <p className="promo-banner__text">
        {banner.message}
        {banner.code ? <> — <span className="promo-banner__code">{banner.code}</span></> : null}
      </p>
    </div>
  );
}
