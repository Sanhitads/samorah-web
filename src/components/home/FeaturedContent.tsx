import Link from "next/link";
import { safeHref } from "@/lib/safeHref";
import { gradientClass, isGradientPlaceholder, isColorValue } from "@/lib/product";

/**
 * Featured spotlight (Phase 7 · point 28) — renders a single featured item (product / chapter /
 * atmosphere / testimonial / artist / journal piece) chosen from a dropdown in the builder. Purely
 * presentational: it reads the denormalised display fields the picker filled (title/blurb/image/href),
 * so no runtime entity resolution is needed. A testimonial (no image) renders as a pull-quote.
 */
function Media({ src, alt, mobileSrc }: { src: string; alt: string; mobileSrc?: string }) {
  if (isColorValue(src)) return <div className="feat__img" style={{ background: src }} role="img" aria-label={alt} />;
  if (isGradientPlaceholder(src)) return <div className={`feat__img ${gradientClass(src) ?? ""}`} role="img" aria-label={alt} />;
  /* eslint-disable @next/next/no-img-element */
  const img = <img className="feat__img feat__img--photo" src={src} alt={alt} loading="lazy" />;
  /* eslint-enable @next/next/no-img-element */
  if (mobileSrc) return <picture><source media="(max-width: 768px)" srcSet={mobileSrc} />{img}</picture>;
  return img;
}

export function FeaturedContent({ eyebrow, title, blurb, image, imageMobile, imageAlt, href, ctaLabel, entityType }: {
  eyebrow?: string; title?: string; blurb?: string; image?: string; imageMobile?: string; imageAlt?: string; href?: string; ctaLabel?: string; entityType?: string;
}) {
  if (!title && !blurb) return null;
  const hasImage = !!image && image.trim().length > 0;
  const isQuote = entityType === "testimonial" || (!hasImage && !!blurb);

  return (
    <section className="feat" data-kind={entityType || "product"}>
      <div className="feat__inner">
        {isQuote ? (
          <blockquote className="feat__quote">
            {eyebrow ? <p className="feat__eyebrow">{eyebrow}</p> : null}
            <p className="feat__quote-text">“{blurb}”</p>
            {title ? <cite className="feat__cite">— {title}</cite> : null}
            {ctaLabel ? <div className="feat__cta"><Link href={safeHref(href)} className="btn btn-outline">{ctaLabel}</Link></div> : null}
          </blockquote>
        ) : (
          <div className="feat__card">
            {hasImage ? <div className="feat__media"><Media src={image!} alt={imageAlt || title || ""} mobileSrc={imageMobile} /></div> : null}
            <div className="feat__body">
              {eyebrow ? <p className="feat__eyebrow">{eyebrow}</p> : null}
              {title ? <h2 className="feat__title">{title}</h2> : null}
              {blurb ? <p className="feat__blurb">{blurb}</p> : null}
              {ctaLabel ? <Link href={safeHref(href)} className="btn btn-outline feat__link">{ctaLabel}</Link> : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
