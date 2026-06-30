import type { JSX } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { ChapterCollectionSettings } from "@/lib/chapterPage";

/**
 * Chapter Product Collection (section type "ProductCollection") — the rest of
 * the chapter as a grid of ProductCards, presented through the configured card
 * `variant` + CTA. `groupBy` is carried for a future grouped layout. Server
 * component.
 */
export function ChapterProductCollection({ settings }: SectionComponentProps) {
  const s = settings as unknown as ChapterCollectionSettings;
  if (s.products.length === 0) return null; // empty strategy decided visibility

  const level = s.a11y?.headingLevel ?? 2;
  const Heading = `h${level}` as keyof JSX.IntrinsicElements;
  const cardLevel = Math.min(level + 1, 6) as 3 | 4 | 5 | 6;

  return (
    <div className="chapter-collection">
      <div className="chapter-collection__head">
        {s.chapterContext ? <p className="chapter-collection__context">{s.chapterContext}</p> : null}
        {s.heading ? <Heading className="chapter-collection__heading">{s.heading}</Heading> : null}
      </div>
      <div className="chapter-collection__grid" data-group={s.groupBy}>
        {s.products.map((p) => (
          <ProductCard
            key={p.slug}
            variant={s.cardVariant}
            a11y={{ headingLevel: cardLevel }}
            product={{
              slug: p.slug,
              name: p.name,
              tagline: p.tagline,
              edition: p.edition,
              collectionType: p.collectionType,
              priceLabel: p.priceLabel,
              media: p.media,
              commerce: p.commerce,
              cta: { label: s.cardCta.label, href: s.cardCta.href ?? `/shop/${p.slug}` },
            }}
          />
        ))}
      </div>
    </div>
  );
}
