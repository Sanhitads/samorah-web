import Link from "next/link";

/**
 * Testimonials (CMS repeatable-blocks demo) — reader voices, fully DB-driven: the
 * heading, the optional CTA, and each quote block come from the Homepage Builder's
 * schema-driven settings (no config). The first section built entirely on the
 * repeatable-blocks capability.
 */
export interface Testimonial { quote?: string; author?: string; role?: string }
export interface TestimonialsContent {
  heading?: string;
  items?: Testimonial[];
  ctaEnabled?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
}

export function Testimonials({ content }: { content: TestimonialsContent }) {
  const items = (content.items ?? []).filter((t) => t.quote?.trim());
  if (!items.length) return null;
  return (
    <section className="home-testi">
      <div className="home-testi__inner">
        {content.heading ? <h2 className="home-testi__heading">{content.heading}</h2> : null}
        <ul className="home-testi__grid">
          {items.map((t, i) => (
            <li key={i} className="home-testi__card">
              <p className="home-testi__quote">“{t.quote}”</p>
              <p className="home-testi__by">{t.author}{t.role ? <span className="home-testi__role"> · {t.role}</span> : null}</p>
            </li>
          ))}
        </ul>
        {content.ctaEnabled && content.ctaLabel && content.ctaHref ? (
          <div className="home-testi__cta"><Link href={content.ctaHref} className="btn btn-ghost">{content.ctaLabel}</Link></div>
        ) : null}
      </div>
    </section>
  );
}
