/**
 * Draft-preview overlay (SEO Phase 2 · points 21·22, PageSeoPanel nuance). PURE. This is NOT a metadata
 * resolver — it never merges site defaults or entity metadata. It takes the already-resolved EFFECTIVE
 * baseline (from the canonical getEffectiveSeo) and overlays the operator's UNSAVED editor values purely
 * for a visual "Draft preview", so the preview updates instantly without server-resolving every keystroke.
 * When a form field is blank, the effective/inherited baseline shows through.
 */
import type { EffectiveSeo } from "@/services/seoRedirectService";

export interface PreviewSeo { title: string; description: string; canonical: string; ogImage: string }
export interface DraftPatch { title?: string; description?: string; canonical?: string; ogImage?: string }

const baseVal = (f?: { value: string | null }) => f?.value ?? "";

/** Overlay unsaved form values on the effective baseline. A non-empty form value wins; a blank field
 *  falls through to the resolved/inherited value. Presentation only. */
export function draftPreview(effective: EffectiveSeo | null, patch: DraftPatch): PreviewSeo {
  const pick = (formVal: string | undefined, eff?: { value: string | null }) => (formVal && formVal.trim() ? formVal : baseVal(eff));
  return {
    title: pick(patch.title, effective?.title),
    description: pick(patch.description, effective?.description),
    canonical: pick(patch.canonical, effective?.canonical),
    ogImage: pick(patch.ogImage, effective?.ogImage),
  };
}
