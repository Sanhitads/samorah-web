import type { PromoBanner as PromoBannerData } from "@/services/couponAdminService";

/**
 * Storefront promotional strip — advertises a coupon (e.g. "Use SAVE10 for 10% off"). Visibility is
 * entirely the admin's call (the `enabled` toggle on /admin/coupons). It sits just under the announcement
 * bar; the floating header's offset is widened for it via --top-bars (set in the store layout). Fixed
 * height so that offset is deterministic. The highlighted code is a copy-friendly chip.
 */
export function PromoBanner({ banner }: { banner: PromoBannerData }) {
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
