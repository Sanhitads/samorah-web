import type { JSX } from "react";
import { ChapterRail } from "@/components/chapters/ChapterRail";
import type { HomeChapter } from "@/config/chapters";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { ChapterRailSettings } from "@/lib/chapterPage";

/**
 * Chapter Rail section (section type "ChapterRail") — the closing "Continue
 * reading": the other chapters, rendered through the shared editorial
 * `ChapterRail` (built once, reused everywhere). Maps the chapter view-models to
 * the rail's HomeChapter shape. Server component (the rail itself is a client
 * island).
 */
export function ChapterRailSection({ settings }: SectionComponentProps) {
  const s = settings as unknown as ChapterRailSettings;
  if (s.chapters.length === 0) return null;

  const level = s.a11y?.headingLevel ?? 2;
  const Heading = `h${level}` as keyof JSX.IntrinsicElements;

  const chapters: HomeChapter[] = s.chapters.map((c, i) => ({
    id: c.slug,
    slug: c.slug,
    volume: c.volume ?? "",
    title: c.name,
    tagline: c.tagline ?? "",
    mood: "",
    description: "",
    image: c.image,
    ctaLabel: "Discover",
    displayOrder: i,
    isVisible: true,
    isComingSoon: c.comingSoon,
  }));

  return (
    <div className="chapter-next">
      {s.heading ? <Heading className="chapter-next__heading">{s.heading}</Heading> : null}
      <ChapterRail chapters={chapters} ariaLabel="Other chapters" layout={s.layout} />
    </div>
  );
}
