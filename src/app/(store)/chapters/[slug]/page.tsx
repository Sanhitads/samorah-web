import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCollectionBySlug, getCollections } from "@/services/collectionService";
import { buildChapterPage, type ChapterInput, type ChapterSummary } from "@/lib/chapterPage";
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
  return buildChapterPage(
    collection as unknown as ChapterInput,
    all as unknown as ChapterSummary[],
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadChapterPage(slug);
  return withRouteSeo(`/chapters/${slug}`, page ? buildPageMetadata(page) : {});
}

export default async function ChapterRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await loadChapterPage(slug);
  if (!page || !isPagePublished(page)) notFound();
  return <PageView page={page} />;
}
