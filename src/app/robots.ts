import type { MetadataRoute } from "next";
import { canonicalUrl, canonicalOrigin } from "@/config/site";

/** robots.txt — derives from the canonical domain (config/site.ts). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/checkout", "/cart", "/account", "/admin"],
    },
    sitemap: canonicalUrl("/sitemap.xml"),
    host: canonicalOrigin(),
  };
}
