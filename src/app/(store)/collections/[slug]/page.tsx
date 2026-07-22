import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getAirVolume, getAirVolumes } from "@/config/theHours";
import { getAirVolumeData } from "@/services/productService";
import { buildAirVolumeFromDb, airChapterVars } from "@/lib/airFromProduct";
import { buildAirVolumePage } from "@/lib/airPage";
import { isPagePublished } from "@/platform/pageResolver";
import { PageView, buildPageMetadata } from "@/components/page";
import { withRouteSeo } from "@/services/seoRedirectService";

/**
 * Air Chapters / The Hours (Experience B) — `/collections/[slug]`. The route
 * does no layout: read the volume (config) → buildAirVolumePage → PageView.
 * Config-driven, so fully static. Proves the platform with a second template
 * (AIR_HOURS_TEMPLATE) and experience, reusing the same engines + Hero.
 */
export const dynamicParams = true;
export const revalidate = 3600;

export function generateStaticParams() {
  return getAirVolumes().map((v) => ({ slug: v.slug }));
}

/** Prefer a DB-managed air volume (collection + its air products); fall back to the config volume. */
async function loadAirVolume(slug: string) {
  const db = await getAirVolumeData(slug);
  return (db ? buildAirVolumeFromDb(db.col, db.products, db.nextCol) : null) ?? getAirVolume(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const vol = await loadAirVolume(slug);
  return withRouteSeo(`/collections/${slug}`, vol ? buildPageMetadata(buildAirVolumePage(vol)) : {});
}

export default async function CollectionRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const vol = await loadAirVolume(slug);
  if (!vol) notFound();
  const page = buildAirVolumePage(vol);
  if (!isPagePublished(page)) notFound();
  const vars = airChapterVars(vol);
  return vars ? <div style={vars as CSSProperties}><PageView page={page} /></div> : <PageView page={page} />;
}
