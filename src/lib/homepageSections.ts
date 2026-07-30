/**
 * Homepage list-section resolvers (Homepage CMS) — map a composed section's saved `settings.items`
 * blocks onto the typed shapes the storefront components already render. With NO saved items each
 * falls back to the config catalogue, so an un-edited homepage renders byte-for-byte as before. Pure
 * + framework-agnostic, so it is unit-tested directly (the components stay presentational).
 */
import { getVisibleChapters, type HomeChapter } from "@/config/chapters";
import { getFeaturedExperiences, type FeaturedExperience } from "@/config/experiences";
import { getEditorialWorld, type EditorialStory } from "@/config/editorialWorld";
import type { ComposedSection } from "@/services/pageComposerService";

type S = Record<string, unknown>;
const asArr = (v: unknown): S[] => (Array.isArray(v) && v.length ? (v as S[]) : []);
const sstr = (v: unknown, d = "") => (typeof v === "string" && v.trim() ? (v as string) : d);
const snum = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? (v as number) : d);
const toLines = (v: unknown): string[] => sstr(v).split(/\n+/).map((x) => x.trim()).filter(Boolean);

const EDITORIAL_IMPORTANCE = ["Opening", "Ritual", "Detail", "Still Life", "Closing"] as const;

export function chaptersFromSettings(s: ComposedSection): HomeChapter[] {
  const items = asArr(s.settings?.items);
  if (!items.length) return getVisibleChapters();
  return items.map((it, i) => ({
    id: sstr(it.slug) || `ch-${i}`, slug: sstr(it.slug), volume: sstr(it.volume), title: sstr(it.title),
    tagline: sstr(it.tagline), mood: "", description: "", image: sstr(it.image, "gradient:grad-chai"),
    ctaLabel: sstr(it.ctaLabel, "Discover"), displayOrder: i, isVisible: true, isComingSoon: false,
  }));
}

export function experiencesFromSettings(s: ComposedSection, cid: string): FeaturedExperience[] {
  const items = asArr(s.settings?.items);
  if (!items.length) return getFeaturedExperiences(cid);
  return items.map((it, i) => ({
    id: sstr(it.id) || `exp-${i}`, title: sstr(it.title), displayName: sstr(it.displayName) || undefined,
    productType: sstr(it.productType), chapter: sstr(it.chapter), chapterSlug: sstr(it.chapterSlug) || undefined,
    scene: sstr(it.scene), memory: sstr(it.memory), atmosphereIndex: toLines(it.atmosphereIndex), signatureLine: sstr(it.signatureLine),
    scent: { opening: sstr(it.scentOpening), unfolding: sstr(it.scentUnfolding), lingering: sstr(it.scentLingering) },
    ctaLabel: sstr(it.ctaLabel, "Discover"), ctaHref: sstr(it.ctaHref, "#"),
    image: sstr(it.image, "gradient:grad-chai"), imageAlt: sstr(it.imageAlt),
    backgroundTone: sstr(it.backgroundTone, "ember"), overlayStrength: snum(it.overlayStrength, 0.6),
    colorScheme: it.colorScheme === "on-light" ? "on-light" : "on-dark",
    lineColor: sstr(it.lineColor) || undefined,
    homepageFeatured: true, displayOrder: i, isVisible: true,
  }));
}

export function editorialFromSettings(s: ComposedSection, cid: string): EditorialStory[] {
  const items = asArr(s.settings?.items);
  if (!items.length) return getEditorialWorld(cid);
  return items.map((it, i) => ({
    id: sstr(it.id) || `plate-${i}`, title: sstr(it.title), image: sstr(it.image, "gradient:grad-atm1"),
    imageAlt: sstr(it.imageAlt) || sstr(it.title), destinationUrl: sstr(it.destinationUrl) || undefined,
    editorialImportance: (EDITORIAL_IMPORTANCE as readonly string[]).includes(sstr(it.editorialImportance))
      ? (sstr(it.editorialImportance) as EditorialStory["editorialImportance"]) : "Detail",
    homepageFeatured: true, displayOrder: i, visibility: true,
  }));
}
