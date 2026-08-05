/**
 * schema.org/BreadcrumbList JSON-LD (SEO Phase 3 · P1-10). ONE reusable builder — each route supplies
 * only the hierarchy it can canonically prove (no inferred/fabricated levels). Absolute item URLs use
 * the production origin, consistent with the other builders.
 */
import { productionOrigin } from "@/config/site";

export interface Crumb { name: string; path: string }

const absUrl = (path: string) => (path.startsWith("http") ? path : `${productionOrigin()}${path === "/" ? "" : path.startsWith("/") ? path : `/${path}`}`);

export function breadcrumbLd(crumbs: Crumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absUrl(c.path) })),
  };
}

/** Build from a page's stored canonical breadcrumb ({label, href}[]) — no fabricated hierarchy. Returns
 *  null for a trivial (<2-level) trail so nothing meaningless is emitted. */
export function breadcrumbLdFromItems(items: { label: string; href: string }[]): Record<string, unknown> | null {
  const crumbs = (items ?? []).filter((i) => i?.label && i?.href).map((i) => ({ name: i.label, path: i.href }));
  return crumbs.length >= 2 ? breadcrumbLd(crumbs) : null;
}

// Canonical hierarchies the routes can prove:
export const productBreadcrumb = (name: string, slug: string) => breadcrumbLd([{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }, { name, path: `/shop/${slug}` }]);
export const chapterBreadcrumb = (name: string, slug: string) => breadcrumbLd([{ name: "Home", path: "/" }, { name, path: `/chapters/${slug}` }]);
export const collectionBreadcrumb = (name: string, slug: string) => breadcrumbLd([{ name: "Home", path: "/" }, { name, path: `/collections/${slug}` }]);
