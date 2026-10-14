import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getCollectionBySlug, getCollections } from "@/services/collectionService";
import { candleChaptersOnly, isAirCollectionSlug } from "@/config/theHours";
import { getHomepageSections } from "@/services/homepageService";
import { chaptersFromSettings } from "@/lib/homepageSections";
import { getVisibleChapters } from "@/config/chapters";
import { buildChapterPage, chapterContentVars, chapterAccentCss, chapterGradientCss, type ChapterInput, type ChapterSummary, type ChapterContent } from "@/lib/chapterPage";
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
    // Candle chapters only — the air "The Hours" collections live at /collections/[slug], not here.
    return candleChaptersOnly(collections.filter((c) => !c.is_coming_soon)).map((c) => ({ slug: c.slug }));
  } catch {
    return []; // DB unreachable at build → render on demand (dynamicParams)
  }
}

async function loadChapterPage(slug: string) {
  // The air "The Hours" collections (e.g. The Everyday) are NOT candle chapters — they render at
  // /collections/[slug] via the air builder. Reject them here so /chapters/<air-slug> 404s instead of
  // serving the air collection through the candle template (mirrors /collections rejecting candle slugs).
  if (isAirCollectionSlug(slug)) return null;
  const [collection, sections] = await Promise.all([getCollectionBySlug(slug), getHomepageSections()]);
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
  // The "Next in The Fragrance Library" rail + prev/next nav are built from the SAME chapter cards the
  // homepage "Samorah Chapters" section uses (image, tagline, volume label) so the two stay in sync —
  // uploading a cover in the homepage section reflects here. Falls back to the config catalogue when the
  // homepage section is empty. Candle-only by construction (that section lists no air chapters), with
  // candleChaptersOnly as a belt-and-suspenders guard.
  const chaptersSection = sections.find((s) => s.type === "chapters");
  const homeChapters = chaptersSection ? chaptersFromSettings(chaptersSection) : getVisibleChapters();
  const railChapters: ChapterSummary[] = homeChapters.map((hc) => ({
    id: hc.id,
    slug: hc.slug,
    name: hc.title,
    volume: hc.volume || null,
    tagline: hc.tagline || null,
    cover_image_url: hc.image || null,
    is_coming_soon: hc.isComingSoon ?? false,
  }));
  const page = buildChapterPage({ ...raw, products } as unknown as ChapterInput, candleChaptersOnly(railChapters), {}, content);
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
  const scoped = [chapterAccentCss(result.content, cid), chapterGradientCss(result.content, cid)].filter(Boolean).join("");
  return vars || scoped ? (
    <div style={vars as CSSProperties} data-cid={cid}>
      {scoped ? <style dangerouslySetInnerHTML={{ __html: scoped }} /> : null}
      <PageView page={result.page} />
    </div>
  ) : (
    <PageView page={result.page} />
  );
}
