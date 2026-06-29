/**
 * Sections & Blocks (§6, §7) — composition over templates.
 *
 * Responsibility: the composable units a page is built from — a Section is
 * `type` + **variant** + envelope + child Blocks; never duplicated per look.
 * Principles: Composition over Templates; Every Component is CMS-ready.
 */
import type {
  ThemeToken,
  EditorialMood,
  Spacing,
  AnimationStyle,
  LifecycleStatus,
} from "./primitives";
import type { AssetRef } from "./asset";
import type { RenderCondition } from "./render";

export type SectionType =
  | "Hero"
  | "Story"
  | "Quote"
  | "FeaturedProduct"
  | "FeaturedExperience"
  | "ProductCollection"
  | "Gallery"
  | "Divider"
  | "ChapterRail"
  | "InvitationPair"
  | "HoursGroup"
  | "Newsletter"
  | "FutureVolume"
  | "Video"
  | (string & {});

/** Variant names are validated per type by the Section Registry (later step).
 *  e.g. Hero: classic | minimal | immersive | editorial | cinematic | campaign. */
export type SectionVariant = string;

/** A named narrative slot a section occupies in a template — structure over
 *  position, so the section filling a slot can change without breaking the flow. */
export type TemplateSlot =
  | "opening"
  | "narrative"
  | "product"
  | "atmosphere"
  | "closing"
  | (string & {});

export interface SectionInstance {
  id: string;
  type: SectionType;
  variant: SectionVariant;
  order: number;
  visibility: boolean;
  /** The narrative slot this section fills in its template (opening/product/…). */
  slot?: TemplateSlot;

  // — lifecycle & conditional rendering (§18, §16) —
  /** Section-level lifecycle (beyond visibility): draft → published → archived;
   *  preview shows non-published. Default (undefined) = published. */
  status?: LifecycleStatus;
  /** Declarative "render if" (campaign · auth · country · device · date · flag). */
  renderIf?: RenderCondition;
  /** Ids of sections this one needs — it renders only if they render too. */
  dependsOn?: string[];
  /** Version, for history/rollback — managed by the CMS later [Future]. */
  version?: number;
  /** An editor's unpublished edits, merged over `settings` only in preview. */
  previewSettings?: Record<string, unknown>;

  // — envelope (applied uniformly by SectionShell) —
  themeToken?: ThemeToken;
  editorialMood?: EditorialMood;
  spacing?: Spacing;
  animation?: AnimationStyle;
  layout?: string;
  background?: AssetRef | ThemeToken;

  // — campaign / analytics —
  campaignOverrides?: Record<string, Partial<SectionInstance>>;
  trackingId?: string;
  experimentId?: string;

  // — content + children —
  settings: Record<string, unknown>; // type-specific; validated by the section schema
  blocks?: BlockInstance[];
}

export type BlockType =
  | "Quote"
  | "Image"
  | "Product"
  | "Divider"
  | "Button"
  | "Video"
  | "Statistic"
  | "Table"
  | "GalleryImage"
  | "HourEntry"
  | "RichText"
  | (string & {});

export interface BlockInstance {
  id: string;
  type: BlockType;
  order: number;
  visibility: boolean;
  settings: Record<string, unknown>;
}
