"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { gradientClass, isGradientPlaceholder } from "@/lib/product";
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

export function Hero({ campaign }: { campaign: HeroCampaign }) {
  const reduceMotion = useReducedMotion();
  const animate = campaign.animate !== false && !reduceMotion;

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
        <div
          className="home-hero__bg home-hero__bg--photo"
          style={{
            backgroundImage: `url(${campaign.heroImage})`,
            // Per-breakpoint focal (#21): CSS vars so a media query can reframe on phones (inline
            // background-position couldn't be overridden by a media query). Absent → center (unchanged).
            "--focal-d": campaign.heroImage__focal || "center",
            "--focal-m": campaign.heroImage__focalMobile || campaign.heroImage__focal || "center",
            // "contain" shows the whole image (no crop); it must not tile, so disable repeat.
            ...(campaign.imageFit === "contain" ? { backgroundSize: "contain", backgroundRepeat: "no-repeat" } : null),
          } as CSSProperties}
          aria-hidden="true"
        />
      )}
      {overlayStyle !== "none" ? (
        <div className="home-hero__scrim" data-style={overlayStyle} style={overlayStyleCss(overlayStyle, op)} aria-hidden="true" />
      ) : null}

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
          {campaign.ctaLabel && campaign.ctaHref ? (
            <motion.div className="home-hero__cta-row" {...reveal(0.34)}>
              <Link href={campaign.ctaHref} className="btn btn-ghost home-hero__cta" data-style={buttonStyle}>
                {campaign.ctaLabel}
              </Link>
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
