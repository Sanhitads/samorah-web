import type { Metadata } from "next";

/**
 * Auth page — no SEO value, should not be indexed. noindex, but follow stays enabled (there is no reason
 * to drop link-following). A server layout is the only way to set robots on a "use client" page; no
 * robots.txt Disallow is added so the directive remains crawlable.
 */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthRouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
