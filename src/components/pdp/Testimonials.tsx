"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { TestimonialsSettings } from "@/lib/productEditorial";

/**
 * Testimonials (block, client) — "From Our Homes". Curated editorial voices as a
 * slow auto-advancing crossfade slider (no stars / counts / avatars, per
 * Decision 25). Pauses on hover/focus; under prefers-reduced-motion it falls
 * back to a static list and does not auto-advance. Self-hides when empty.
 */
const INTERVAL = 5500;

export function Testimonials({ settings }: SectionComponentProps) {
  const s = settings as unknown as TestimonialsSettings;
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = s.quotes?.length ?? 0;
  const interval = s.intervalMs && s.intervalMs >= 2000 ? s.intervalMs : INTERVAL;

  useEffect(() => {
    if (reduce || paused || count < 2) return;
    const id = setInterval(() => setActive((i) => (i + 1) % count), interval);
    return () => clearInterval(id);
  }, [reduce, paused, count, interval]);

  if (!count) return null;

  const head = (
    <div className="testimonials__head">
      {s.eyebrow ? <p className="testimonials__eyebrow">{s.eyebrow}</p> : null}
      {s.heading ? <h2 className="testimonials__heading">{s.heading}</h2> : null}
    </div>
  );

  // Reduced motion — a quiet static list, no auto-advance.
  if (reduce) {
    return (
      <div className="testimonials">
        {head}
        <ul className="testimonials__list">
          {s.quotes.map((q, i) => (
            <li key={i} className="testimonial testimonial--static">
              <blockquote className="testimonial__quote">“{q.quote}”</blockquote>
              {q.attribution ? <p className="testimonial__attr">{q.attribution}</p> : null}
              {i < count - 1 ? <span className="testimonial__sep" aria-hidden="true" /> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      className="testimonials"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {head}
      <div className="testimonials__slider" aria-live="polite" aria-atomic="true">
        {s.quotes.map((q, i) => (
          <figure key={i} className="testimonial" data-active={i === active} aria-hidden={i !== active}>
            <blockquote className="testimonial__quote">“{q.quote}”</blockquote>
            {q.attribution ? <figcaption className="testimonial__attr">{q.attribution}</figcaption> : null}
          </figure>
        ))}
      </div>
      {count > 1 ? (
        <div className="testimonials__dots" role="tablist" aria-label="Voices">
          {s.quotes.map((_, i) => (
            <button
              key={i}
              type="button"
              className="testimonials__dot"
              data-active={i === active}
              role="tab"
              aria-selected={i === active}
              aria-label={`Voice ${i + 1} of ${count}`}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
