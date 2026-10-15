import type { Metadata } from "next";

/** Internal CMS preview surface — noindex,nofollow in all environments; no robots.txt Disallow so the
 *  directive is crawlable. See pdp-preview/layout.tsx. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PreviewRouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
