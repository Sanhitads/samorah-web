import type { SectionComponentProps } from "@/components/sections/registry";
import type { TestimonialsSettings } from "@/lib/productEditorial";

/**
 * Testimonials (block) — "From Our Homes". Curated editorial voices, no stars /
 * counts / avatars / "verified buyer" (Decision 25). Reusable; self-hides with
 * no empty spacing when there are no voices.
 */
export function Testimonials({ settings }: SectionComponentProps) {
  const s = settings as unknown as TestimonialsSettings;
  if (!s.quotes?.length) return null;

  return (
    <div className="testimonials">
      <div className="testimonials__head">
        {s.eyebrow ? <p className="testimonials__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="testimonials__heading">{s.heading}</h2> : null}
      </div>
      <ul className="testimonials__list">
        {s.quotes.map((q, i) => (
          <li key={i} className="testimonial">
            <blockquote className="testimonial__quote">“{q.quote}”</blockquote>
            {q.attribution ? <p className="testimonial__attr">{q.attribution}</p> : null}
            {i < s.quotes.length - 1 ? <span className="testimonial__sep" aria-hidden="true" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
