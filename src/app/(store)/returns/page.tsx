import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { getPage } from "@/services/cmsService";

const SLUG = "returns";
export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage(SLUG);
  return { title: p?.seo.title || p?.title || "Samorah", description: p?.seo.description || p?.intro };
}

export const dynamic = "force-dynamic";

export default async function Page() {
  const p = await getPage(SLUG);
  if (!p) notFound();
  return <LegalPage eyebrow={p.eyebrow} title={p.title} intro={p.intro} sections={p.sections} footNote={p.source === "config" ? undefined : undefined} />;
}
