import type { Metadata } from "next";

/** Auth page — noindex, follow (see login/layout.tsx). Server layout so a "use client" page gets a robots
 *  directive; no robots.txt Disallow so it stays crawlable. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthRouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
