import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getCollectionBySlug, getCollections } from "@/services/collectionService";
import { buildChapterPage, chapterContentVars, chapterAccentCss, type ChapterInput, type ChapterSummary, type ChapterContent } from "@/lib/chapterPage";
import { isPagePublished } from "@/platform/pageResolver";
import { PageView, buildPageMetadata } from "@/components/page";
import { withRouteSeo } from "@/services/seoRedirectService";

/**
 * Chapter page (Phase 8, step 9, Beat 3) — `/chapters/[slug]`. The route does
 * no layout: it fetches the collection (+ siblings), builds a platform Page from
 * the Editorial Chapter template, gates it by lifecycle, and renders it through
 * PageView. SEO comes from the same Page via buildPageMetadata. ISR: editorial
 * chapters refresh hourly; unknown slugs render on demand.
 */
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const collections = await getCollections();
    return collections.filter((c) => !c.is_coming_soon).map((c) => ({ slug: c.slug }));
  } catch {
    return []; // DB unreachable at build → render on demand (dynamicParams)
  }
}

async function loadChapterPage(slug: string) {
  const [collection, all] = await Promise.all([getCollectionBySlug(slug), getCollections()]);
  if (!collection) return null;
  const content = ((collection as { chapter_content?: ChapterContent | null }).chapter_content) ?? undefined;
  // Per-product chapter overrides live in air_content (card image, from-price) / pdp_content (type).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = collection as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products = (raw.products ?? []).map((p: any) => {
    const ac = p.air_content ?? {};
    const pc = p.pdp_content ?? {};
    return { ...p, chapterImage: ac.chapterImage ?? null, chapterFromPrice: ac.chapterFromPrice != null ? Number(ac.chapterFromPrice) : null, collection_type: pc.collectionType ?? p.collection_type };
  });
  const page = buildChapterPage({ ...raw, products } as unknown as ChapterInput, all as unknown as ChapterSummary[], {}, content);
  return { page, content };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadChapterPage(slug);
  return withRouteSeo(`/chapters/${slug}`, result ? buildPageMetadata(result.page) : {});
}

export default async function ChapterRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadChapterPage(slug);
  if (!result || !isPagePublished(result.page)) notFound();
  const vars = chapterContentVars(result.content);
  const cid = `chapter-${slug}`;
  const accentCss = chapterAccentCss(result.content, cid);
  return vars || accentCss ? (
    <div style={vars as CSSProperties} data-cid={cid}>
      {accentCss ? <style dangerouslySetInnerHTML={{ __html: accentCss }} /> : null}
      <PageView page={result.page} />
    </div>
  ) : (
    <PageView page={result.page} />
  );
}
