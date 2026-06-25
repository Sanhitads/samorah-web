"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { gradientClass, isGradientPlaceholder } from "@/lib/product";
import type { BrandStory as BrandStoryData } from "@/config/brandStory";

/**
 * Section 3 (internally "Brand Story") — the maker's quiet.
 *
 * No section title is ever shown — the visitor experiences it through the
 * image, the type and the words. An asymmetric editorial spread on soft-beige
 * where the photography is the dominant anchor and extends beyond the text.
 * The reveal is handcrafted, not synchronised: the image settles first, then the
 * eyebrow, heading, copy and CTA arrive in a subtle stagger. Everything is
 * driven by the `story` object (orientation/tone/copy/quote all CMS-ready).
 */
const EASE_OUT = [0, 0, 0.2, 1] as const;

export function BrandStory({ story }: { story: BrandStoryData }) {
  const reduceMotion = useReducedMotion();
  const placeholder = isGradientPlaceholder(story.image);

  const reveal = (delay: number) =>
    reduceMotion
      ? {
          initial: { opacity: 0 },
          whileInView: { opacity: 1 },
          viewport: { once: true, margin: "0px 0px -80px 0px" },
          transition: { duration: 0.5 },
        }
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "0px 0px -80px 0px" },
          transition: { duration: 0.75, ease: EASE_OUT, delay },
        };

  return (
    <section
      className="home-story"
      data-orientation={story.orientation}
      data-tone={story.backgroundTone}
      data-mood={story.photographyMood}
    >
      <div className="home-story__inner">
        {/* The image settles first */}
        <motion.div className="home-story__media" {...reveal(0)}>
          {placeholder ? (
            <div
              className={`home-story__image ${gradientClass(story.image) ?? ""}`}
              aria-hidden="true"
            />
          ) : (
            <div
              className="home-story__image home-story__image--photo"
              style={{ backgroundImage: `url(${story.image})` }}
              role="img"
              aria-label={story.imageAlt}
            />
          )}
        </motion.div>

        <div className="home-story__content">
          <motion.p className="home-story__eyebrow" {...reveal(0.3)}>
            {story.eyebrow}
          </motion.p>
          <motion.h2 className="home-story__heading" {...reveal(0.4)}>
            {story.heading}
          </motion.h2>
          {story.quote ? (
            <motion.p className="home-story__quote" {...reveal(0.5)}>
              {story.quote}
            </motion.p>
          ) : (
            <motion.p className="home-story__body" {...reveal(0.5)}>
              {story.body}
            </motion.p>
          )}
          <motion.div className="home-story__cta-wrap" {...reveal(0.6)}>
            <Link href={story.ctaHref} className="home-story__cta text-link">
              {story.ctaLabel}
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
