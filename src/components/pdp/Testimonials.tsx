"use client";

import { useEffect, useState, type CSSProperties } from "react";
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

/**
 * Resolve a quote into its spoken text + who said it. The attribution field wins; when it's blank we
 * lift a trailing "— Name" / "- Name" out of the quote itself (its own line, or after the final stop),
 * so a review typed as `"…vanilla.\n- Rajeev, Mumbai"` renders the name on its own line — never inside
 * the quotation marks and never a stray hyphen mid-sentence.
 */
function parseQuote(q: { quote: string; attribution?: string }): { text: string; attr?: string } {
  const strip = (s: string) => s.replace(/^[\s\-—–]+/, "").trim();
  const attribution = q.attribution?.trim();
  if (attribution) return { text: q.quote.trim(), attr: strip(attribution) || undefined };
  const raw = q.quote.trim();
  const byLine = raw.match(/^([\s\S]+?)\n\s*[-—–]\s*(.+)$/); // dash-led final line (the usual way people type it)
  if (byLine && byLine[1].trim()) return { text: byLine[1].trim(), attr: strip(byLine[2]) };
  const inline = raw.match(/^(.+?[.!?"'”’])\s+[-—–]\s+([^-\n]{2,50})$/); // short "— Name" on the same line
  if (inline) return { text: inline[1].trim(), attr: strip(inline[2]) };
  // A short final line with no sentence-ending punctuation reads as the attribution (a name / place).
  const lines = raw.split(/\n/);
  if (lines.length >= 2) {
    const last = lines[lines.length - 1].trim();
    const head = lines.slice(0, -1).join("\n").trim();
    if (head && last.length >= 2 && last.length <= 40 && !/[.!?"”’]$/.test(last)) return { text: head, attr: strip(last) };
  }
  return { text: raw };
}

export function Testimonials({ settings }: SectionComponentProps) {
  const s = settings as unknown as TestimonialsSettings;
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = s.quotes?.length ?? 0;
  const interval = s.intervalMs && s.intervalMs >= 2000 ? s.intervalMs : INTERVAL;
  // Optional admin-chosen font colour → drives every text token in the section via one CSS var.
  const colorStyle = (s.color ? { "--testimonial-ink": s.color } : undefined) as CSSProperties | undefined;

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
      <div className="testimonials" style={colorStyle}>
        {head}
        <ul className="testimonials__list">
          {s.quotes.map((q, i) => {
            const { text, attr } = parseQuote(q);
            return (
              <li key={i} className="testimonial testimonial--static">
                <blockquote className="testimonial__quote">“{text}”</blockquote>
                {attr ? <p className="testimonial__attr">{attr}</p> : null}
                {i < count - 1 ? <span className="testimonial__sep" aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div
      className="testimonials"
      style={colorStyle}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {head}
      <div className="testimonials__slider" aria-live="polite" aria-atomic="true">
        {s.quotes.map((q, i) => {
          const { text, attr } = parseQuote(q);
          return (
            <figure key={i} className="testimonial" data-active={i === active} aria-hidden={i !== active}>
              <blockquote className="testimonial__quote">“{text}”</blockquote>
              {attr ? <figcaption className="testimonial__attr">{attr}</figcaption> : null}
            </figure>
          );
        })}
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
