"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { gradientClass, isGradientPlaceholder } from "@/lib/product";
import {
  ATMOSPHERE_HEADING,
  type FeaturedExperience,
} from "@/config/experiences";

/**
 * Section 4 (internally "The Atmosphere") — the signature section.
 *
 * "Today's Atmosphere" is a permanent heading; only the experience beneath it
 * changes. Selecting another fragrance makes the whole environment *breathe
 * together* in one slow crossfade — photography, tonal air, typography, copy,
 * Atmosphere Index, signature line and scent all dissolve as one. No carousel /
 * slider / autoplay / parallax / horizontal motion.
 *
 * PRODUCT-AGNOSTIC: it renders purely from atmosphere data and a generic CTA.
 * `productType` is printed verbatim as an editorial label and never branched on
 * — a candle, room spray, linen spray or bundle are presented identically.
 */
const EASE_LUXURY = [0.25, 0.1, 0.25, 1] as const;

// First / Then / Finally — presentation labels for the Fragrance Journey.
const SCENT_STEPS = ["First", "Then", "Finally"] as const;

// Decorative leader-line lengths (px). NOT data and NOT a measurement — a fixed
// set rotated by descriptor index so each line looks intentionally irregular
// while remaining purely typographic, like leader lines in an archive.
// PROVISIONAL Phase 7: the whole Atmosphere Language is to be revisited once
// the full site is built and real photography is integrated.
const LEADER_WIDTHS = [88, 56, 120, 72, 104, 48, 96, 64] as const;

export function Atmosphere({
  experiences,
}: {
  experiences: FeaturedExperience[];
}) {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  // Slow editorial arrival — reveal only once the section is genuinely in view.
  const inView = useInView(sectionRef, {
    once: true,
    margin: "0px 0px -20% 0px",
  });
  const [active, setActive] = useState(0);

  if (!experiences.length) return null;

  const exp = experiences[Math.min(active, experiences.length - 1)];
  const multiple = experiences.length > 1;
  const placeholder = isGradientPlaceholder(exp.image);
  const scentLines = [exp.scent.opening, exp.scent.unfolding, exp.scent.lingering];

  // The air crossfades slowly (≈1.6s) — markedly slower than the rest of the page.
  const bgTransition = reduce
    ? { duration: 0.5 }
    : { duration: 1.6, ease: EASE_LUXURY };

  // Copy dissolves out, then resolves in with a quiet stagger.
  const contentVariants: Variants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: reduce
        ? { duration: 0.4 }
        : {
            duration: 0.6,
            ease: EASE_LUXURY,
            delayChildren: 0.25,
            staggerChildren: 0.09,
          },
    },
    exit: {
      opacity: 0,
      transition: { duration: reduce ? 0.3 : 0.45, ease: EASE_LUXURY },
    },
  };

  const itemVariants: Variants = {
    initial: { opacity: 0, y: reduce ? 0 : 12 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0.4 : 0.7, ease: EASE_LUXURY },
    },
  };

  return (
    <section
      ref={sectionRef}
      className="home-atmosphere"
      data-scheme={exp.colorScheme ?? "on-dark"}
    >
      {/* The air — photography + tonal overlay, breathing together on change. */}
      <div className="home-atmosphere__stage" aria-hidden="true">
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={exp.id}
            className="home-atmosphere__bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={bgTransition}
          >
            {/* The gradient is only a placeholder. When `image` becomes a
                Cloudinary URL it renders here as the full immersive background;
                the tonal overlay below (colour + opacity) is CMS-driven, so
                photography lands with no component change. */}
            {placeholder ? (
              <div
                className={`home-atmosphere__image ${gradientClass(exp.image) ?? ""}`}
              />
            ) : (
              <div
                className="home-atmosphere__image home-atmosphere__image--photo"
                style={{ backgroundImage: `url(${exp.image})` }}
              />
            )}
            <div
              className="home-atmosphere__tone"
              data-tone={exp.backgroundTone}
              style={{ opacity: exp.overlayStrength }}
            />
            <div className="home-atmosphere__scrim" />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="home-atmosphere__inner">
        {/* Permanent heading — never changes when switching experiences. */}
        <motion.p
          className="home-atmosphere__heading"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reduce ? 0.4 : 0.8, ease: EASE_LUXURY }}
        >
          {ATMOSPHERE_HEADING}
        </motion.p>

        <div className="home-atmosphere__row">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={exp.id}
              className="home-atmosphere__content"
              variants={contentVariants}
              initial="initial"
              animate={inView ? "animate" : "initial"}
              exit="exit"
            >
              <motion.h2 className="home-atmosphere__title" variants={itemVariants}>
                {exp.title}
              </motion.h2>

              {/* Two different concepts, two different treatments: the product
                  medium (what it is) and the chapter (the story world). */}
              <motion.p className="home-atmosphere__meta" variants={itemVariants}>
                <span className="home-atmosphere__type">{exp.productType}</span>
                <span className="home-atmosphere__chapter">
                  <span className="home-atmosphere__from">from</span> {exp.chapter}
                </span>
              </motion.p>

              <motion.div className="home-atmosphere__line" variants={itemVariants}>
                <span className="home-atmosphere__label">Scene</span>
                <p className="home-atmosphere__say">{exp.scene}</p>
              </motion.div>

              <motion.div className="home-atmosphere__line" variants={itemVariants}>
                <span className="home-atmosphere__label">Memory</span>
                <p className="home-atmosphere__say">{exp.memory}</p>
              </motion.div>

              {/* Atmosphere Index — quiet, decorative gold leader lines (lengths
                  generated below, never from data): an archive, never a meter. */}
              <motion.div className="home-atmosphere__block" variants={itemVariants}>
                <span className="home-atmosphere__label">Atmosphere</span>
                <ul className="atmos-index">
                  {exp.atmosphereIndex.map((word, i) => (
                    <li className="atmos-index__row" key={word}>
                      <span className="atmos-index__word">{word}</span>
                      <span
                        className="atmos-index__rule"
                        aria-hidden="true"
                        style={{ width: LEADER_WIDTHS[i % LEADER_WIDTHS.length] }}
                      />
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* The crescendo — one unforgettable sentence, after the Index. */}
              <motion.p
                className="home-atmosphere__signature"
                variants={itemVariants}
              >
                {exp.signatureLine}
              </motion.p>

              {/* Fragrance Journey — First / Then / Finally. */}
              <motion.div className="home-atmosphere__block" variants={itemVariants}>
                <span className="home-atmosphere__label">Fragrance Journey</span>
                <dl className="scent-progression">
                  {scentLines.map((line, i) => (
                    <div className="scent-progression__row" key={SCENT_STEPS[i]}>
                      <dt>{SCENT_STEPS[i]}</dt>
                      <dd>{line}</dd>
                    </div>
                  ))}
                </dl>
              </motion.div>

              <motion.div
                className="home-atmosphere__cta-wrap"
                variants={itemVariants}
              >
                <Link href={exp.ctaHref} className="home-atmosphere__cta text-link">
                  {exp.ctaLabel}
                </Link>
              </motion.div>
            </motion.div>
          </AnimatePresence>

          {/* Quiet name-index (only when more than one) — each item is a
              fragrance, never a chapter. Selecting one makes the room breathe. */}
          {multiple ? (
            <nav className="home-atmosphere__index" aria-label="Choose a fragrance">
              <ul>
                {experiences.map((e, i) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="home-atmosphere__index-item"
                      data-active={i === active}
                      aria-current={i === active}
                      onClick={() => setActive(i)}
                    >
                      {e.displayName ?? e.title}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  );
}
