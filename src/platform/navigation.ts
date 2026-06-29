/**
 * Navigation graph (§15) — how pages relate, plus the site menus.
 *
 * Responsibility: model page-to-page navigation (parent / children / next /
 * previous / related), breadcrumbs, and menu structures. Targets are *resolved*
 * from the relationship graph + experience membership (resolvers, a later step)
 * — never hardcoded. Foundational for chapters, breadcrumbs and future
 * experiences. Principle: Configuration over Hardcoding.
 */

/** Per-page navigation references — resolved, not hardcoded. */
export interface PageNavigation {
  parent?: string;
  children?: string[];
  previous?: string;
  next?: string;
  related?: string[];
  campaign?: string;
  chapter?: string;
  journey?: string;
}

export interface BreadcrumbItem {
  label: string;
  href: string;
}

/** A site menu node (header / footer mega-menu) as a platform model. */
export interface MenuItem {
  id: string;
  label: string;
  href?: string;
  experienceId?: string;
  tier?: number; // mega-menu hierarchy (parent → child)
  comingSoon?: boolean;
  visibility: boolean;
  order: number;
  children?: MenuItem[];
}

export interface Menu {
  id: string; // "header" | "footer" | …
  items: MenuItem[];
}
