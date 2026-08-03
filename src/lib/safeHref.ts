/**
 * safeHref — protocol allowlist for CMS-authored link targets (hero CTA, content-block buttons,
 * featured-content links). Staff-authored, but authored hrefs still reach `<a href>` / Next `<Link>`,
 * so a stray `javascript:`/`data:` scheme should never render as a live link. We allow only the schemes
 * a marketing link legitimately needs (http/https, site-relative, in-page anchor, mailto, tel); anything
 * else with an explicit scheme collapses to "#" (an inert anchor). Empty/relative paths pass through.
 */
const SAFE = /^(?:https?:\/\/|\/[^/]|\/$|#|mailto:|tel:)/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function safeHref(href: string | null | undefined): string {
  if (!href) return "#";
  const h = href.trim();
  if (!h) return "#";
  if (SAFE.test(h)) return h;
  // A protocol-relative or scheme-bearing URL that isn't allowlisted → neutralise it.
  if (h.startsWith("//") || HAS_SCHEME.test(h)) return "#";
  return h; // bare relative path (e.g. "products/foo") — safe
}
