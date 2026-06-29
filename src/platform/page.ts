/**
 * Platform hierarchy (§3, §4, §5) — Experience → Journey → Page.
 *
 * Responsibility: model the page tree — Experiences pages belong to, optional
 * Journeys that group them, and the Page itself (identity + metadata + an
 * ordered Section[]). Principles: Experience before Product; Configuration over
 * Hardcoding.
 */
import type {
  ThemeToken,
  EditorialMood,
  LifecycleStatus,
  Schedule,
} from "./primitives";
import type { TaxonomyRef } from "./taxonomy";
import type { SeoMeta } from "./content";
import type { PageNavigation, BreadcrumbItem } from "./navigation";
import type { SectionInstance } from "./section";
import type { AssetRef } from "./asset";

// — Cache strategy (§5): rendering strategy belongs to the PAGE, not the route,
//   so it survives a change of framework. Resolve → Cache → Render. [seam] —
export type PageCacheMode = "static" | "isr" | "dynamic" | "preview";
export interface PageCachePolicy {
  mode: PageCacheMode;
  /** ISR revalidation window, seconds (mode === "isr"). */
  revalidate?: number;
  /** Cache tags for on-demand invalidation [Future]. */
  tags?: string[];
}

// — Page analytics (§22): the lifecycle events a page declares it emits. The
//   implementation is [Future]; the contract exists now, mirroring Sections. —
export type PageEventType = "viewed" | "scrolled" | "completed" | "cta";
export interface PageEvents {
  emits?: PageEventType[];
  /** Scroll-depth checkpoints (%) at which to fire "scrolled". */
  scrollDepths?: number[];
  trackingId?: string;
}

// — Page manifest (§5): CMS-facing identity, never rendered — mirrors the
//   Template manifest so the future CMS manages pages consistently. —
export interface PageManifest {
  displayName?: string;
  previewAsset?: AssetRef;
  purpose?: string;
  owner?: string;
}

// — Experience (§3): pages belong to one; product-agnostic. —
export type ExperienceKind =
  | "candle-chapters"
  | "air-chapters"
  | "shop"
  | "journal"
  | "campaign"
  | "gift";

export interface Experience {
  id: string;
  kind: ExperienceKind;
  title: string;
  baseRoute: string; // "/chapters" · "/collections" · "/shop"
  defaultTemplate: string;
  themeToken: ThemeToken;
  experienceType?: string; // opaque medium label (never branched on)
  status: LifecycleStatus;
  visibility: boolean;
}

// — Journey (§4): optional narrative arc of pages within an experience. —
export interface Journey {
  id: string;
  experienceId: string;
  title: string;
  slug: string;
  editorialMood?: EditorialMood;
  themeToken?: ThemeToken;
  order: number;
  status: LifecycleStatus;
  visibility: boolean;
  pageIds: string[]; // ordered
}

// — Page (§5): metadata + an ordered Section[]. —
export interface Page {
  id: string;
  experienceId: string;
  journeyId?: string;
  slug: string;
  template: string;
  designSystemVersion?: string; // §2; default = current

  status: LifecycleStatus;
  visibility: boolean;
  schedule?: Schedule;
  cachePolicy?: PageCachePolicy; // default: derived from status (draft → dynamic)
  events?: PageEvents; // analytics seam [Future impl]
  manifest?: PageManifest; // CMS identity, never rendered

  palette: ThemeToken;
  editorialMood?: EditorialMood;
  campaignId?: string;
  taxonomy?: TaxonomyRef[];

  navigation: PageNavigation;
  seo: SeoMeta;
  breadcrumb: BreadcrumbItem[];

  sections: SectionInstance[];

  // — i18n [Future] —
  locale?: string;
  localizedFrom?: string;
}
