import type { Metadata } from "next";

/**
 * Wishlist — a personal, session-scoped utility page with no indexable value. noindex, follow (so outbound
 * product links are still followed), consistent with cart/checkout/account/order. Server layout so this
 * "use client" page gets a robots directive; no robots.txt Disallow so the directive stays crawlable.
 */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function WishlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
