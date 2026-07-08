/**
 * Site / domain — the ONE canonical domain the whole app derives from. Canonical
 * URLs · metadata · sitemap · robots · JSON-LD · OG · email links · Razorpay
 * callbacks · webhooks all read from here. Alias domains are configuration only:
 * add/remove them (or the hosting redirect rules) with ZERO application-code
 * changes. Platform (Vercel/Cloudflare) should 301 aliases → primary; the
 * middleware is the fallback when platform redirects aren't available.
 */
export const SITE_CONFIG = {
  /** The single canonical production domain (override per-env via NEXT_PUBLIC_SITE_DOMAIN). */
  primaryDomain: (process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samorahstudio.com")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .toLowerCase(),
  protocol: "https" as const,
  brandName: "Samorah",
  /** Owned domains that permanently redirect to `primaryDomain`. Edit freely. */
  aliases: ["samorah.in", "samorah.co", "samorah.store"] as string[],
};

/** Normalise a host: strip port + leading www + lowercase. */
export function bareHost(host: string): string {
  return host.replace(/:\d+$/, "").replace(/^www\./, "").toLowerCase();
}

/** The canonical origin. Production always resolves to the primary domain; dev /
 *  preview may point at NEXT_PUBLIC_SITE_URL (e.g. http://localhost:3000). */
export function canonicalOrigin(): string {
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  return `${SITE_CONFIG.protocol}://${SITE_CONFIG.primaryDomain}`;
}

/** An absolute canonical URL for a path ("/shop" → "https://…/shop"). */
export function canonicalUrl(path = ""): string {
  const p = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${canonicalOrigin()}${p}`;
}

/** The production origin — ALWAYS the primary domain, ignoring the dev/preview
 *  override. Use for links that leave the app (emails, invoices, webhooks) so they
 *  never point at localhost / vercel.app / a preview URL. */
export function productionOrigin(): string {
  return `${SITE_CONFIG.protocol}://${SITE_CONFIG.primaryDomain}`;
}

/** An absolute production URL (for emails etc.) — never a dev/preview host. */
export function productionUrl(path = ""): string {
  const p = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${productionOrigin()}${p}`;
}

/** True when a request host is NOT the primary (an alias or any other domain). */
export function isNonPrimaryHost(host: string): boolean {
  const bare = bareHost(host);
  if (bare === "localhost" || bare.startsWith("127.") || bare.endsWith(".vercel.app")) return false;
  return bare !== SITE_CONFIG.primaryDomain;
}
