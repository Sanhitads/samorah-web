import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAirVolume, getAirVolumes } from "@/config/theHours";
import { buildAirVolumePage } from "@/lib/airPage";
import { isPagePublished } from "@/platform/pageResolver";
import { PageView, buildPageMetadata } from "@/components/page";

/**
 * Air Chapters / The Hours (Experience B) — `/collections/[slug]`. The route
 * does no layout: read the volume (config) → buildAirVolumePage → PageView.
 * Config-driven, so fully static. Proves the platform with a second template
 * (AIR_HOURS_TEMPLATE) and experience, reusing the same engines + Hero.
 */
export const dynamicParams = true;

export function generateStaticParams() {
  return getAirVolumes().map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const vol = getAirVolume(slug);
  return vol ? buildPageMetadata(buildAirVolumePage(vol)) : {};
}

export default async function CollectionRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const vol = getAirVolume(slug);
  if (!vol) notFound();
  const page = buildAirVolumePage(vol);
  if (!isPagePublished(page)) notFound();
  return <PageView page={page} />;
}
