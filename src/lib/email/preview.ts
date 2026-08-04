/**
 * Email preview viewport widths (Phase 3 · point 16). Deliberately NOT a device simulator — email
 * clients differ too much for that to be meaningful. It's a simple viewport-width switch so an author
 * can sanity-check how the fixed-width email reflows in a narrow inbox vs a desktop one.
 */
export type PreviewMode = "desktop" | "mobile";

/** Frame width (px) for each mode. Desktop ~ a roomy inbox column; mobile ~ a typical phone width. */
export const PREVIEW_WIDTH: Record<PreviewMode, number> = { desktop: 680, mobile: 390 };

export function previewWidth(mode: PreviewMode): number {
  return PREVIEW_WIDTH[mode] ?? PREVIEW_WIDTH.desktop;
}
