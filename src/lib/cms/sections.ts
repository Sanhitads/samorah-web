/**
 * Shared CMS section primitives for editorial pages (Product Care and future ones).
 *
 * These optional fields extend the base content section ADDITIVELY — text-only policy
 * pages never set them, so they are unaffected. Kept in a leaf module (imports nothing)
 * so both the service layer (`cmsService.PageSection`), the config seed (`legalContent`),
 * and the renderer/editor can share one source of truth with no import cycle.
 *
 * An image references a media id (for the Media Library reverse-lookup / delete-protection
 * in `mediaService.getMediaUsage`) AND carries its delivery `url` so the renderer needs no
 * join. Never copy a URL without the id — see docs/CMS_ARCHITECTURE.md.
 */
export interface SectionImage {
  /** Media Library asset id — powers usage tracking + delete protection. */
  mediaId?: string;
  /** Delivery URL (Cloudinary upload or external). The renderer reads this directly. */
  url: string;
  /** Accessible description. Empty → the image is treated as decorative. */
  alt?: string;
  /** Optional editorial caption shown beneath the image. */
  caption?: string;
  /** Focal point as a CSS position string ("50% 30%") when the editor set one. */
  focal?: string;
}

/** Editorial placement of a section's image relative to its text. "overlay" is an image
 *  break with centred text over the image (a distinct section type, not a text placement). */
export type SectionLayout = "left" | "right" | "center" | "wide" | "overlay";
/** Crop shape for a section's image (CLS-safe aspect reserved before load). */
export type SectionRatio = "square" | "portrait" | "landscape";
/** Which editorial section type this is. Stored EXPLICITLY (optional) so the editor can switch types
 *  non-destructively; when absent the renderer/editor infer it from the shape (back-compatible with
 *  the config seed). "person" is the People page's contributor block (rendered per `displayStyle`). */
export type SectionVariant = "editorial" | "overlay" | "accordion" | "statement" | "divider" | "person";

/** How a contributor (a `person` section) renders — the role HIERARCHY, stored as content so people
 *  can be added/reordered/reweighted entirely in the CMS (no code): a large editorial feature, a
 *  standard grid card, or a larger highlighted card. Hidden uses the existing `hidden` toggle. */
export type DisplayStyle = "feature" | "card" | "highlight";

/** The optional editorial fields a content section may carry (Product Care et al.). */
export interface EditorialFields {
  /** Small step marker ("01"). */
  step?: string;
  /** Small uppercase heading / eyebrow ("FIRST BURN"). */
  label?: string;
  /** The section's image (with layout/ratio describing how to place it). */
  image?: SectionImage;
  layout?: SectionLayout;
  ratio?: SectionRatio;
  /** Explicit section type (optional) — set by the editor so switching type never has to discard
   *  content; when absent, the type is inferred from the shape. */
  variant?: SectionVariant;
  /** Text alignment for an overlay image break — left / center / right. Optional; defaults to
   *  center (the original behaviour). Presentational only — reuses the section, adds no new type. */
  align?: "left" | "center" | "right";
  /** An optional pull-quote (People feature profiles). Rendered as a quiet editorial line. */
  quote?: string;
  /** For a `person` section — how it renders (feature block vs grid card vs highlight card). */
  displayStyle?: DisplayStyle;
  /** Hidden sections are stored but never rendered on the storefront (CMS toggle). */
  hidden?: boolean;
}
