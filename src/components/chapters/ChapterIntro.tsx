import type { JSX } from "react";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { ChapterIntroSettings } from "@/lib/chapterPage";

/**
 * Chapter Intro (section type "ChapterIntro") — the opening pause: VOL · chapter
 * title · a single poetic line, and no product. Pure atmosphere, to create
 * anticipation before the signature fragrance. Reads ChapterIntroSettings;
 * themed by SectionShell. Server component.
 */
/** Break one poetic line into its clauses (on em-dash / sentence) so the
 *  introduction reads as two or three measured lines, not one long sentence. */
function introLines(intro: string | null): string[] {
  if (!intro) return [];
  return intro
    .split(/\s*[—–]\s*|(?<=[.!?])\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function ChapterIntro({ settings }: SectionComponentProps) {
  const s = settings as unknown as ChapterIntroSettings;
  const level = s.a11y?.headingLevel ?? 2;
  const Heading = `h${level}` as keyof JSX.IntrinsicElements;
  const lines = introLines(s.intro);

  return (
    <div className="chapter-intro">
      {s.volume ? <p className="chapter-intro__volume">{s.volume.toUpperCase()}</p> : null}
      <Heading className="chapter-intro__title">{s.title}</Heading>
      {lines.length > 0 ? (
        <p className="chapter-intro__line">
          {lines.map((line, i) => (
            <span key={i} className="chapter-intro__clause">
              {line}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
