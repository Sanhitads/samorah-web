"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { gradientClass, isGradientPlaceholder, isColorValue } from "@/lib/product";
import type { HomeChapter } from "@/config/chapters";
import type { RailLayout } from "@/lib/presentation";

/**
 * Editorial Chapter Rail — the permanent Chapter navigation system (Homepage,
 * Chapters landing, Related, Explore More, editorial nav). Built once, reused
 * everywhere. Data-driven and responsive: it never assumes a fixed count, and
 * naturally reveals more chapters as they exist.
 *
 * Editorial horizontal browse, NOT a carousel — no autoplay, no dots, no loop.
 * Native horizontal scroll (swipe on touch); on overflow, quiet architectural
 * arrows appear and disappear when unneeded. Hierarchy stays equal — the active
 * campaign's chapters are expressed later through editorial photography, never
 * larger cards/badges/borders.
 */
const EASE_OUT = [0, 0, 0.2, 1] as const;
const SKELETON_COUNT = 4;

export interface ChapterRailProps {
  chapters: HomeChapter[];
  loading?: boolean;
  ariaLabel?: string;
  /** Presentation layout — "editorial" (the horizontal browse) today; the
   *  others are reserved so the rail evolves by config, not new components. */
  layout?: RailLayout;
}

export function ChapterRail({
  chapters,
  loading = false,
  ariaLabel = "Chapters",
  layout = "editorial",
}: ChapterRailProps) {
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const syncArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflowing = scrollWidth - clientWidth > 4;
    setCanPrev(overflowing && scrollLeft > 4);
    setCanNext(overflowing && scrollLeft < scrollWidth - clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    syncArrows();
    el.addEventListener("scroll", syncArrows, { passive: true });
    window.addEventListener("resize", syncArrows);
    return () => {
      el.removeEventListener("scroll", syncArrows);
      window.removeEventListener("resize", syncArrows);
    };
  }, [syncArrows, chapters.length, loading]);

  const scrollByDirection = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const item = el.querySelector<HTMLElement>("[data-rail-item]");
    const step = item ? item.offsetWidth + 24 : el.clientWidth * 0.8;
    el.scrollBy({
      left: direction * step * 2,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  if (!loading && chapters.length === 0) return null;

  return (
    <div className="chapter-rail" data-layout={layout}>
      <div
        className="chapter-rail__track"
        ref={trackRef}
        role="list"
        aria-label={ariaLabel}
      >
        {loading
          ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="chapter-rail__item"
                data-rail-item
                role="listitem"
                aria-hidden="true"
              >
                <div className="home-chapter home-chapter--skeleton" />
              </div>
            ))
          : chapters.map((chapter, i) => (
              <motion.div
                key={chapter.id}
                className="chapter-rail__item"
                data-rail-item
                role="listitem"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
                whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px -80px 0px" }}
                transition={{
                  duration: 0.8,
                  ease: EASE_OUT,
                  delay: Math.min(i, 6) * 0.08,
                }}
              >
                <ChapterCard chapter={chapter} />
              </motion.div>
            ))}
      </div>

      {canPrev && (
        <button
          type="button"
          className="chapter-rail__nav chapter-rail__nav--prev"
          aria-label="Previous chapters"
          onClick={() => scrollByDirection(-1)}
        >
          <ChevronLeft size={18} strokeWidth={1.25} aria-hidden="true" />
        </button>
      )}
      {canNext && (
        <button
          type="button"
          className="chapter-rail__nav chapter-rail__nav--next"
          aria-label="More chapters"
          onClick={() => scrollByDirection(1)}
        >
          <ChevronRight size={18} strokeWidth={1.25} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** A single Chapter "book cover". Layout is fixed; the image (gradient now,
 *  editorial photography later) carries each chapter's identity. */
function ChapterCard({ chapter }: { chapter: HomeChapter }) {
  const body = (
    <>
      {isColorValue(chapter.image) ? (
        <span className="home-chapter__image" style={{ background: chapter.image }} aria-hidden="true" />
      ) : isGradientPlaceholder(chapter.image) ? (
        <span
          className={`home-chapter__image ${gradientClass(chapter.image) ?? ""}`}
          aria-hidden="true"
        />
      ) : (
        <span
          className="home-chapter__image home-chapter__image--photo"
          style={{ backgroundImage: `url(${chapter.image})` }}
          aria-hidden="true"
        />
      )}
      <span className="home-chapter__overlay" aria-hidden="true" />
      <span className="home-chapter__inner">
        <span className="home-chapter__volume">{chapter.volume}</span>
        <h3 className="home-chapter__title">{chapter.title}</h3>
        <p className="home-chapter__tagline">{chapter.tagline}</p>
        {chapter.isComingSoon ? (
          <span className="home-chapter__soon">Coming Soon</span>
        ) : (
          <span className="home-chapter__cta">{chapter.ctaLabel}</span>
        )}
      </span>
    </>
  );

  if (chapter.isComingSoon) {
    return <div className="home-chapter home-chapter--soon">{body}</div>;
  }
  return (
    <Link
      href={`/chapters/${chapter.slug}`}
      className="home-chapter"
      aria-label={`${chapter.volume} — ${chapter.title}`}
    >
      {body}
    </Link>
  );
}
