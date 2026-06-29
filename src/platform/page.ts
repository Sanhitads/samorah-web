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
