"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { gradientClass, isGradientPlaceholder } from "@/lib/product";
import type { HeroCampaign } from "@/config/campaigns";

/**
 * Homepage Hero (Phase 7 · Section 1) — the threshold.
 *
 * A **campaign-driven** editorial component: it renders entirely from the
 * `campaign` object (image, eyebrow, heading, copy, CTA) — nothing is
 * hardcoded. The layout, type, spacing, motion and treatment stay fixed; only
 * the campaign content changes (see config/campaigns + PROJECT_CONTEXT
 * "Homepage Campaign System"). The floating transparent Header reads against
 * this dark candlelit ground.
 */
const EASE_OUT = [0, 0, 0.2, 1] as const;

export function Hero({ campaign }: { campaign: HeroCampaign }) {
  const reduceMotion = useReducedMotion();

  const reveal = (delay: number) =>
    reduceMotion
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.5 } }
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, ease: EASE_OUT, delay },
        };

  const placeholder = isGradientPlaceholder(campaign.heroImage);

  return (
    <section className="home-hero" data-theme={campaign.theme}>
      {placeholder ? (
        <div
          className={`home-hero__bg ${gradientClass(campaign.heroImage) ?? ""}`}
          aria-hidden="true"
        />
      ) : (
        <div
          className="home-hero__bg home-hero__bg--photo"
          style={{ backgroundImage: `url(${campaign.heroImage})` }}
          aria-hidden="true"
        />
      )}
      <div className="home-hero__scrim" aria-hidden="true" />

      <div className="home-hero__inner">
        <div className="home-hero__content">
          <motion.p className="home-hero__eyebrow" {...reveal(0)}>
            {campaign.eyebrow}
          </motion.p>
          <motion.h1 className="home-hero__heading" {...reveal(0.1)}>
            {campaign.heading}
          </motion.h1>
          <motion.p className="home-hero__sub" {...reveal(0.22)}>
            {campaign.subheading}
          </motion.p>
          <motion.div className="home-hero__cta-row" {...reveal(0.34)}>
            <Link href={campaign.ctaHref} className="btn btn-ghost">
              {campaign.ctaLabel}
            </Link>
          </motion.div>
        </div>
      </div>

      <div className="home-hero__scroll" aria-hidden="true">
        <span className="home-hero__scroll-label">Scroll</span>
        <span className="home-hero__scroll-line" />
      </div>
    </section>
  );
}
