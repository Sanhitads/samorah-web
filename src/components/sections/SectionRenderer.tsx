import type { ReactNode } from "react";
import type { SectionInstance } from "@/platform/section";
import {
  evaluateRenderCondition,
  isSectionPublished,
  type RenderContext,
} from "@/platform/render";
import { SectionShell } from "./SectionShell";
import { SectionErrorBoundary } from "./SectionErrorBoundary";
import { getSectionDefinition } from "./registry";

/**
 * SectionRenderer (§16) — renders a page's `Section[]`:
 *   campaign override → lifecycle gate → conditional rules → dependency check →
 *   order → theme inheritance → render each in its shell, inside an error
 *   boundary, with the shared RenderContext. Unknown types are skipped (dev-warn).
 */
function applyCampaign(
  section: SectionInstance,
  campaignId?: string,
): SectionInstance {
  const override = campaignId ? section.campaignOverrides?.[campaignId] : undefined;
  return override ? { ...section, ...override } : section;
}

export function SectionRenderer({
  sections,
  context = {},
}: {
  sections: SectionInstance[];
  context?: RenderContext;
}): ReactNode {
  const candidates = sections
    .map((s) => applyCampaign(s, context.campaignId))
    .filter((s) => s.visibility !== false)
    .filter((s) => isSectionPublished(s.status, context.preview))
    .filter((s) => evaluateRenderCondition(s.renderIf, context));

  const candidateIds = new Set(candidates.map((s) => s.id));

  const ordered = candidates
    .filter((s) => !s.dependsOn || s.dependsOn.every((d) => candidateIds.has(d)))
    .sort((a, b) => a.order - b.order)
    // theme inheritance: a section without its own token uses the page's;
    // in preview, scroll-reveal is disabled so the whole page renders at its
    // final state immediately (a true WYSIWYG editing surface, not hidden-till-scrolled).
    .map((s) => ({
      ...s,
      themeToken: s.themeToken ?? context.themeToken,
      animation: context.preview ? "none" : s.animation,
    }));

  return (
    <>
      {ordered.map((section) => {
        const def = getSectionDefinition(section.type);
        if (!def) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `[sections] No section registered for type "${section.type}".`,
            );
          }
          return null;
        }
        const Component = def.component;
        // in preview, an editor's unpublished edits layer over the live settings
        const settings =
          context.preview && section.previewSettings
            ? { ...section.settings, ...section.previewSettings }
            : section.settings;
        return (
          <SectionErrorBoundary key={section.id} sectionId={section.id}>
            <SectionShell section={section}>
              <Component
                settings={settings}
                variant={section.variant}
                blocks={section.blocks}
                section={section}
                context={context}
              />
            </SectionShell>
          </SectionErrorBoundary>
        );
      })}
    </>
  );
}
