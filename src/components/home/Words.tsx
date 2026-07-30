"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import type { EditorialVoice } from "@/config/voices";

/**
 * Section 6 (titleless) — the Editorial / Closing Voice.
 *
 * You simply encounter one beautiful sentence in whitespace — no heading, no
 * quotation-mark graphics, no review card. The only ornament is a single subtle
 * gold hairline. On entering the viewport the whole block fades in with a small
 * (~10px) upward movement — nothing more: no typewriter, no stagger, no carousel
 * or rotating quotes. Even with several voices in the CMS, exactly one curated
 * voice is shown. A quiet pause for reflection.
 */
const EASE_LUXURY = [0.25, 0.1, 0.25, 1] as const;

export function Words({ voice }: { voice: EditorialVoice | null }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });

  if (!voice) return null;

  // Alignment is CMS-driven (Homepage Builder → Words → Alignment). "" / unknown → the editorial default (center).
  const align = (voice as { align?: string }).align;
  const dataAlign = align === "left" || align === "right" ? align : "center";

  return (
    <section className="home-words">
      <motion.figure
        ref={ref}
        className="home-words__figure"
        data-align={dataAlign}
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={
          inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : 10 }
        }
        transition={{ duration: reduce ? 0.5 : 1.1, ease: EASE_LUXURY }}
      >
        <span className="home-words__rule" aria-hidden="true" />
        <blockquote className="home-words__quote">{voice.quote}</blockquote>
        <figcaption className="home-words__author">— {voice.author}</figcaption>
      </motion.figure>
    </section>
  );
}
