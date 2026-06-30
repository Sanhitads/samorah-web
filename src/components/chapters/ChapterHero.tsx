import type { JSX } from "react";
import { AssetImage } from "@/components/ui/AssetImage";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { ChapterHeroSettings } from "@/lib/chapterPage";

/**
 * Chapter Hero (section type "Hero") — the chapter's opening "book cover": the
 * volume, title, tagline and poetic line over the chapter's atmosphere media.
 * Overlay style, media (image today; video/3d reserved) and heading level are
 * all data. Themed by SectionShell. Server component.
 */
export function ChapterHero({ settings }: SectionComponentProps) {
  const s = settings as unknown as ChapterHeroSettings;
  const level = s.a11y?.headingLevel ?? 1;
  const Heading = `h${level}` as keyof JSX.IntrinsicElements;

  return (
    <header className="chapter-hero" data-overlay={s.overlay} data-aspect={s.media.aspect ?? "cinematic"}>
      <div className="chapter-hero__bg" aria-hidden="true">
        <AssetImage asset={s.media.src} as="background" alt="" role="hero" priority />
      </div>
      {s.overlay !== "none" ? <span className="chapter-hero__veil" aria-hidden="true" /> : null}
      <div className="chapter-hero__inner">
        {s.volume ? <p className="chapter-hero__volume">{s.volume}</p> : null}
        <Heading className="chapter-hero__title">{s.title}</Heading>
        {s.tagline ? <p className="chapter-hero__tagline">{s.tagline}</p> : null}
        {s.poeticLine ? <p className="chapter-hero__poetic">“{s.poeticLine}”</p> : null}
      </div>
    </header>
  );
}
