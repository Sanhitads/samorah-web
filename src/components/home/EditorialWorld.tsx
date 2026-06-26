"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { gradientClass, isGradientPlaceholder } from "@/lib/product";
import type { EditorialStory } from "@/config/editorialWorld";

/**
 * Section 7 (titleless) — the Editorial World: one art-directed magazine spread,
 * never "five images." It is one story told through photographs:
 *
 *   Large Story  (the dominant establishing world, left, tallest)
 *        → Supporting Moments  (ritual → objects → texture → transition, a
 *          centre of intentionally varied crops: portrait · landscape · square ·
 *          macro — never equal tiles; the portrait is clearly secondary to the
 *          Large Story, the lower pair offset so no edges line up perfectly)
 *        → Closing Story  (the life lived in this world — right, ~15% smaller,
 *          set farther away so it breathes as the closing photograph).
 *
 * Gutters are deliberately a little unequal so the eye reads them as hand-set.
 * Each plate is one clickable destination. Hover opens it like a magazine page:
 * a very slow 1.02 zoom and a tiny caption fading in — no overlay, no dark
 * layer. Entry motion is a fade + slight settle (1.03 → 1.00), sequenced along
 * the reading path. Reduced motion → fade only.
 */
const EASE_LUXURY = [0.25, 0.1, 0.25, 1] as const;

function destinationOf(s: EditorialStory): string | null {
  if (s.destinationUrl) return s.destinationUrl;
  if (s.chapterSlug) return `/chapters/${s.chapterSlug}`;
  if (s.collectionSlug) return `/collections/${s.collectionSlug}`;
  return null;
}

function Plate({
  story,
  slot,
  delay,
  inView,
  reduce,
}: {
  story: EditorialStory;
  slot: string;
  delay: number;
  inView: boolean;
  reduce: boolean;
}) {
  const placeholder = isGradientPlaceholder(story.image);
  const href = destinationOf(story);

  const frame = (
    <div className="home-editorial__frame">
      <motion.div
        className="home-editorial__reveal"
        initial={{ opacity: 0, scale: reduce ? 1 : 1.03 }}
        animate={
          inView
            ? { opacity: 1, scale: 1 }
            : { opacity: 0, scale: reduce ? 1 : 1.03 }
        }
        transition={{
          duration: reduce ? 0.5 : 1.2,
          ease: EASE_LUXURY,
          delay: reduce ? 0 : delay,
        }}
      >
        <div
          className={`home-editorial__image ${
            placeholder
              ? gradientClass(story.image) ?? ""
              : "home-editorial__image--photo"
          }`}
          style={
            placeholder ? undefined : { backgroundImage: `url(${story.image})` }
          }
          aria-hidden="true"
        />
      </motion.div>
      <span className="home-editorial__caption" aria-hidden="true">
        {story.title}
      </span>
    </div>
  );

  return href ? (
    <Link
      href={href}
      className="home-editorial__plate"
      data-slot={slot}
      aria-label={story.imageAlt}
    >
      {frame}
    </Link>
  ) : (
    <figure
      className="home-editorial__plate"
      data-slot={slot}
      role="img"
      aria-label={story.imageAlt}
    >
      {frame}
    </figure>
  );
}

export function EditorialWorld({ stories }: { stories: EditorialStory[] }) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });

  if (!stories.length) return null;

  // Large Story (left) · Closing Story (right) · Supporting Moments (centre).
  const hero = stories.find((s) => s.editorialImportance === "Opening") ?? stories[0];
  const closing =
    stories.find((s) => s.editorialImportance === "Closing" && s.id !== hero.id) ??
    (stories.length > 1 ? stories[stories.length - 1] : null);

  const usedIds = new Set([hero.id, closing?.id].filter(Boolean) as string[]);
  const middle = stories.filter((s) => !usedIds.has(s.id));
  const [portrait, landscape, square, macro] = middle; // intentional varied crops

  const order = [hero, portrait, landscape, square, macro, closing].filter(
    Boolean,
  ) as EditorialStory[];
  const delayOf = (s: EditorialStory) =>
    Math.max(0, order.findIndex((o) => o.id === s.id)) * 0.08;

  const plateProps = (s: EditorialStory, slot: string) => ({
    story: s,
    slot,
    delay: delayOf(s),
    inView,
    reduce,
  });

  return (
    <section className="home-editorial">
      <div className="home-editorial__spread" ref={ref}>
        <Plate {...plateProps(hero, "hero")} />

        <div className="home-editorial__center">
          {portrait ? <Plate {...plateProps(portrait, "portrait")} /> : null}
          <div className="home-editorial__center-right">
            {landscape ? <Plate {...plateProps(landscape, "landscape")} /> : null}
            <div className="home-editorial__center-bottom">
              {square ? <Plate {...plateProps(square, "square")} /> : null}
              {macro ? <Plate {...plateProps(macro, "macro")} /> : null}
            </div>
          </div>
        </div>

        {closing ? <Plate {...plateProps(closing, "closing")} /> : null}
      </div>
    </section>
  );
}
