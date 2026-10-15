"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { gradientClass, isGradientPlaceholder } from "@/lib/product";
import { cldUrl, cldSrcSet } from "@/lib/cloudinaryUrl";
import { safeHref } from "@/lib/safeHref";
import type { HeroCampaign } from "@/config/campaigns";

/**
 * Homepage Hero (Phase 7 · Section 1) — the threshold.
 *
 * A **campaign-driven** editorial component: it renders entirely from the
 * `campaign` object (image, eyebrow, heading, copy, CTA). The base layout, type,
 * spacing and treatment stay fixed; only the campaign content changes.
 *
 * Phase 5 · point 24 adds optional treatment controls — background video, content
 * alignment, overlay style/strength, button style, animation and scroll-indicator
 * toggles. Every control is optional: when absent the Hero renders its original
 * fixed look, so existing campaigns and saved sections are untouched.
 */
const EASE_OUT = [0, 0, 0.2, 1] as const;

const isVideo = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//.test(v) && /\.(mp4|webm|mov)(\?|$)/i.test(v);

/** Overlay CSS for the chosen style + strength. `null` opacity → the style's default. */
function overlayStyleCss(style: string, op: number | null): CSSProperties | undefined {
  if (style === "none") return undefined;
  if (style === "dark") return { background: `rgba(0, 0, 0, ${op ?? 0.42})` };
  if (style === "gradient") return { background: `linear-gradient(to top, rgba(0,0,0,${op ?? 0.6}) 0%, rgba(0,0,0,0) 60%)` };
  // "scrim" (default editorial multi-gradient lives in CSS) — strength only scales its opacity.
  return op !== null ? { opacity: op } : undefined;
}

export function Hero({ campaign, headingLevel = 1, priority = true }: { campaign: HeroCampaign; headingLevel?: 1 | 2; priority?: boolean }) {
  const reduceMotion = useReducedMotion();
  const animate = campaign.animate !== false && !reduceMotion;
  // Exactly one logical <h1> per page: when the Hero is a secondary slide (HeroSlider), its heading is
  // demoted to <h2> with the SAME class, so it is visually identical but doesn't create a second H1.
  const Heading = headingLevel === 2 ? motion.h2 : motion.h1;

  const reveal = (delay: number) =>
    !animate
      ? { initial: { opacity: 1 }, animate: { opacity: 1 }, transition: { duration: 0 } }
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, ease: EASE_OUT, delay },
        };

  const hasVideo = isVideo(campaign.videoUrl);
  const placeholder = isGradientPlaceholder(campaign.heroImage);
  const overlayStyle = campaign.overlayStyle ?? "scrim";
  const op = typeof campaign.overlayOpacity === "number" ? Math.max(0, Math.min(100, campaign.overlayOpacity)) / 100 : null;
  const buttonStyle = campaign.buttonStyle ?? "ghost";
  const showScroll = campaign.showScroll !== false;

  return (
    <section className="home-hero" data-theme={campaign.theme} data-align={campaign.align ?? "left"}>
      {hasVideo ? (
        <video
          className="home-hero__bg home-hero__video"
          autoPlay
          muted
          loop
          playsInline
          poster={!placeholder ? campaign.heroImage : undefined}
          aria-hidden="true"
        >
          <source src={campaign.videoUrl} />
        </video>
      ) : placeholder ? (
        <div className={`home-hero__bg ${gradientClass(campaign.heroImage) ?? ""}`} aria-hidden="true" />
      ) : (
        <>
          {/* Real <img> layer (SEO + LCP): a Cloudinary-optimized, responsive, preload-scanner-visible
              image that reproduces the previous background-cover crop via object-fit + object-position
              (the same focal CSS vars). Decorative (alt="" + aria-hidden) — there is no CMS hero-alt field
              yet (reported as a content gap). Only the above-the-fold hero is eager/high priority; secondary
              slides lazy-load so they don't contend with the LCP. Gradient placeholders still render as a
              div (no <img>), so heroes without real photography are visually unchanged. */}
          <img
            className={`home-hero__bg home-hero__bg--photo${campaign.heroImage__mobile ? " home-hero__bg--has-mobile" : ""}`}
            src={cldUrl(campaign.heroImage)}
            srcSet={cldSrcSet(campaign.heroImage)}
            sizes="100vw"
            alt=""
            aria-hidden="true"
            decoding="async"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            style={{
              // Per-breakpoint focal (#21): CSS vars a media query can reframe on phones. Absent → center.
              "--focal-d": campaign.heroImage__focal || "center",
              "--focal-m": campaign.heroImage__focalMobile || campaign.heroImage__focal || "center",
              // "contain" shows the whole image (no crop) instead of cover.
              ...(campaign.imageFit === "contain" ? { objectFit: "contain" } : null),
            } as CSSProperties}
          />
          {/* Art-directed mobile crop (#21) — a separately-shaped image shown only on phones. */}
          {campaign.heroImage__mobile ? (
            <img
              className="home-hero__bg home-hero__bg--mobile"
              src={cldUrl(campaign.heroImage__mobile)}
              srcSet={cldSrcSet(campaign.heroImage__mobile)}
              sizes="100vw"
              alt=""
              aria-hidden="true"
              decoding="async"
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
            />
          ) : null}
        </>
      )}
      {overlayStyle !== "none" ? (
        <div className="home-hero__scrim" data-style={overlayStyle} style={overlayStyleCss(overlayStyle, op)} aria-hidden="true" />
      ) : null}

      <div className="home-hero__inner">
        <div className="home-hero__content">
          <motion.p className="home-hero__eyebrow" {...reveal(0)}>
            {campaign.eyebrow}
          </motion.p>
          <Heading className="home-hero__heading" {...reveal(0.1)}>
            {campaign.heading}
          </Heading>
          <motion.p className="home-hero__sub" {...reveal(0.22)}>
            {campaign.subheading}
          </motion.p>
          {campaign.secondaryLine ? (
            <motion.p className="home-hero__notes" {...reveal(0.28)}>
              {campaign.secondaryLine}
            </motion.p>
          ) : null}
          {(campaign.ctaLabel && campaign.ctaHref) || (campaign.secondaryCtaLabel && campaign.secondaryCtaHref) ? (
            <motion.div className="home-hero__cta-row" {...reveal(0.34)}>
              {campaign.ctaLabel && campaign.ctaHref ? (
                <Link href={safeHref(campaign.ctaHref)} className="btn btn-ghost home-hero__cta" data-style={buttonStyle}>
                  {campaign.ctaLabel}
                </Link>
              ) : null}
              {campaign.secondaryCtaLabel && campaign.secondaryCtaHref ? (
                <Link href={safeHref(campaign.secondaryCtaHref)} className="btn btn-ghost home-hero__cta home-hero__cta--secondary">
                  {campaign.secondaryCtaLabel}
                </Link>
              ) : null}
            </motion.div>
          ) : null}
        </div>
      </div>

      {showScroll ? (
        <div className="home-hero__scroll" aria-hidden="true">
          <span className="home-hero__scroll-label">Scroll</span>
          <span className="home-hero__scroll-line" />
        </div>
      ) : null}
    </section>
  );
}
