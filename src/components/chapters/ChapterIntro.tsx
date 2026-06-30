import type { JSX } from "react";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { ChapterIntroSettings } from "@/lib/chapterPage";

/**
 * Chapter Intro (section type "ChapterIntro") — the opening pause: VOL · chapter
 * title · a single poetic line, and no product. Pure atmosphere, to create
 * anticipation before the signature fragrance. Reads ChapterIntroSettings;
 * themed by SectionShell. Server component.
 */
export function ChapterIntro({ settings }: SectionComponentProps) {
  const s = settings as unknown as ChapterIntroSettings;
  const level = s.a11y?.headingLevel ?? 2;
  const Heading = `h${level}` as keyof JSX.IntrinsicElements;

  return (
    <div className="chapter-intro">
      {s.volume ? <p className="chapter-intro__volume">{s.volume.toUpperCase()}</p> : null}
      <Heading className="chapter-intro__title">{s.title}</Heading>
      {s.intro ? <p className="chapter-intro__line">{s.intro}</p> : null}
    </div>
  );
}
