import type { ReactNode } from "react";
import type { Page } from "@/platform/page";
import { resolvePage, type ResolvePageOptions } from "@/platform/pageResolver";
import { SectionRenderer } from "@/components/sections/SectionRenderer";
import { bootstrapPlatform } from "./bootstrap";

/**
 * PageView (§5) — the one render entry for a template-driven page. Resolves the
 * page (template + overrides → ordered sections + context), emits JSON-LD when
 * present, and hands the sections to the SectionRenderer pipeline. A server
 * component: no client state, no effects. Principle: API before Interface.
 */
export function PageView({
  page,
  options,
}: {
  page: Page;
  options?: ResolvePageOptions;
}): ReactNode {
  bootstrapPlatform();
  const { sections, context } = resolvePage(page, options);

  return (
    <main data-page={page.id} data-experience={page.experienceId}>
      {page.seo.structuredData ? (
        <script
          type="application/ld+json"
          // JSON-LD is data we author, not user input — safe to inline.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(page.seo.structuredData),
          }}
        />
      ) : null}
      <SectionRenderer sections={sections} context={context} />
    </main>
  );
}
