import Link from "next/link";
import type { JSX } from "react";
import { AssetImage } from "@/components/ui/AssetImage";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { ChapterFeaturedSettings } from "@/lib/chapterPage";

/**
 * Chapter Featured Product (section type "FeaturedProduct") — the chapter's
 * signature candle as an editorial spotlight: media beside the name, tagline,
 * price *display* and a CTA whose label comes from settings (§14 projection only).
 * Themed by SectionShell. Server component.
 */
export function ChapterFeaturedProduct({ settings }: SectionComponentProps) {
  const s = settings as unknown as ChapterFeaturedSettings;
  const p = s.product;
  if (!p) return null; // empty strategy decided visibility upstream

  const level = s.a11y?.headingLevel ?? 2;
  const Heading = `h${level}` as keyof JSX.IntrinsicElements;
  const href = s.cta.href ?? `/shop/${p.slug}`;

  return (
    <div className="chapter-featured" data-aspect={p.media.aspect ?? "portrait"} data-solo={s.solo ? "true" : undefined}>
      <Link href={href} className="chapter-featured__media" aria-hidden="true" tabIndex={-1}>
        <AssetImage asset={p.media.src} alt={p.media.alt ?? p.name} role="portrait" className="chapter-featured__image" />
      </Link>
      <div className="chapter-featured__body">
        {s.eyebrow ? <p className="chapter-featured__eyebrow">{s.eyebrow}</p> : null}
        <p className="chapter-featured__edition">{p.edition}</p>
        <Heading className="chapter-featured__name">{p.name}</Heading>
        <p className="chapter-featured__collection">{p.collectionType}</p>
        {p.tagline ? <p className="chapter-featured__tagline">{p.tagline}</p> : null}
        {s.note ? <p className="chapter-featured__note">{s.note}</p> : null}
        <p className="chapter-featured__price">{p.priceLabel}</p>
        <Link href={href} className="chapter-featured__cta">
          {s.cta.label}
        </Link>
      </div>
    </div>
  );
}
