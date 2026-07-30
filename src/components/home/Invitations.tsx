"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { gradientClass, isGradientPlaceholder, isColorValue } from "@/lib/product";
import type { HomeInvitation } from "@/config/invitations";

/**
 * Section 5 (titleless) — two ways of living with fragrance, composed as one
 * editorial spread: a large primary world and a quieter secondary one offset
 * lower, so the eye flows from the first page into the second.
 *
 * The whole plate is clickable, like an editorial plate in a magazine — one
 * anchor over image, title, caption and whitespace, with no hover cards,
 * shadows or button effects (only the existing text-link's quiet dim).
 *
 * Photography is the hero (image ratio is data-driven for future crops); copy
 * is only a caption. Motion is almost absent — a slow photographic settle and a
 * gentle fade. Product-agnostic and curated entirely from data.
 *
 * PHOTOGRAPHY ART-DIRECTION (always): the two plates are ONE connected editorial
 * story, never unrelated marketing assets. The primary image establishes the
 * world; the secondary complements it with a closer, contrasting or supporting
 * perspective — everyday ↔ ritual, wide ↔ detail, morning ↔ evening. The
 * secondary plate is composed to *tuck into* the spread (nudged closer and
 * dropped so its caption meets the lower third of the primary image), never
 * parked beside it.
 */
const EASE_LUXURY = [0.25, 0.1, 0.25, 1] as const;
const DEFAULT_RATIO = "4 / 5";

function InvitationPlate({
  invitation,
  kind,
}: {
  invitation: HomeInvitation;
  kind: "primary" | "secondary";
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLAnchorElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const color = isColorValue(invitation.image);
  const placeholder = isGradientPlaceholder(invitation.image);

  return (
    <Link
      ref={ref}
      href={invitation.ctaHref}
      className="home-living__plate"
      data-kind={kind}
    >
      {/* Large editorial photography — a slow zoom settles on arrival. Ratio is
          data-driven so future invitation types can use different crops. */}
      <div
        className="home-living__frame"
        style={{ aspectRatio: invitation.imageRatio ?? DEFAULT_RATIO }}
      >
        <motion.div
          className={`home-living__image ${
            color ? "" : placeholder ? gradientClass(invitation.image) ?? "" : "home-living__image--photo"
          }`}
          style={
            color
              ? { background: invitation.image }
              : placeholder
                ? undefined
                : { backgroundImage: `url(${invitation.image})` }
          }
          aria-hidden="true"
          initial={{ opacity: 0, scale: reduce ? 1 : 1.06 }}
          animate={
            inView
              ? { opacity: 1, scale: 1 }
              : { opacity: 0, scale: reduce ? 1 : 1.06 }
          }
          transition={{ duration: reduce ? 0.6 : 1.8, ease: EASE_LUXURY }}
        />
      </div>

      {/* Caption — restrained: title, one poetic line, one understated CTA,
          read as a single block. */}
      <motion.div
        className="home-living__caption"
        initial={{ opacity: 0, y: reduce ? 0 : 16 }}
        animate={
          inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : 16 }
        }
        transition={{
          duration: reduce ? 0.5 : 0.9,
          ease: EASE_LUXURY,
          delay: reduce ? 0 : 0.35,
        }}
      >
        <h3 className="home-living__title">{invitation.title}</h3>
        <p className="home-living__line">{invitation.line}</p>
        <span className="home-living__cta text-link">{invitation.ctaLabel}</span>
      </motion.div>
    </Link>
  );
}

export function Invitations({ invitations }: { invitations: HomeInvitation[] }) {
  if (!invitations.length) return null;

  // The primary world leads; every other curated invitation stacks beside it.
  const primary =
    invitations.find((i) => i.emphasis === "primary") ?? invitations[0];
  const secondaries = invitations.filter((i) => i.id !== primary.id);

  return (
    <section className="home-living" data-tone={primary.backgroundTone}>
      <div className="home-living__inner">
        <div className="home-living__primary">
          <InvitationPlate invitation={primary} kind="primary" />
        </div>

        {secondaries.length ? (
          <div className="home-living__secondary">
            {secondaries.map((inv) => (
              <InvitationPlate key={inv.id} invitation={inv} kind="secondary" />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
