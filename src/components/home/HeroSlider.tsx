"use client";

import { useState } from "react";
import { Hero } from "@/components/home/Hero";
import type { HeroCampaign } from "@/config/campaigns";

/**
 * Hero slider — wraps one or more hero campaigns. With a SINGLE slide it renders the bare <Hero>
 * exactly as before (no arrows, no wrapper behaviour change), so an un-edited homepage is untouched.
 * With two or more slides it shows ‹ › arrows that slide horizontally between them (the Secondary
 * Hero becomes slide 2). Arrow-driven only — no autoplay.
 */
export function HeroSlider({ slides }: { slides: HeroCampaign[] }) {
  const [i, setI] = useState(0);
  const n = slides.length;

  // One slide → identical to rendering <Hero> directly; the slider adds nothing.
  if (n <= 1) return <Hero campaign={slides[0]} />;

  const idx = Math.min(i, n - 1);
  const go = (d: number) => setI((p) => (p + d + n) % n); // wrap-around

  return (
    <div className="hero-slider" role="region" aria-roledescription="carousel" aria-label="Homepage hero">
      <div className="hero-slider__track" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {slides.map((s, k) => (
          // key by index: both slides merge the SAME active campaign, so s.id is identical — index is the stable, unique key
          <div className="hero-slider__slide" key={k} aria-hidden={k !== idx}>
            {/* Only the first slide is the page <h1> and the eager/high-priority LCP image; later slides
                are <h2> and lazy so they neither create a second H1 nor contend with the LCP. */}
            <Hero campaign={s} headingLevel={k === 0 ? 1 : 2} priority={k === 0} />
          </div>
        ))}
      </div>
      <button type="button" className="hero-slider__arrow hero-slider__arrow--prev" onClick={() => go(-1)} aria-label="Previous hero">
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" className="hero-slider__arrow hero-slider__arrow--next" onClick={() => go(1)} aria-label="Next hero">
        <span aria-hidden="true">›</span>
      </button>
      <div className="hero-slider__dots" aria-hidden="true">
        {slides.map((s, k) => (
          <span key={k} className={`hero-slider__dot${k === idx ? " is-active" : ""}`} />
        ))}
      </div>
    </div>
  );
}
