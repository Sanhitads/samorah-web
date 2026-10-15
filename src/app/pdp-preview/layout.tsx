import type { Metadata } from "next";

/**
 * Internal CMS preview surface — never a public search result. A server layout is the only way to attach
 * a robots directive to a "use client" page. noindex,nofollow in ALL environments (so it stays out of the
 * index even on production), WITHOUT a robots.txt Disallow so crawlers can actually read the directive.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PreviewRouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
