"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { PlacementGridSettings } from "@/lib/productEditorial";

/**
 * PlacementGrid (block, client) — where the fragrance belongs, as quiet editorial
 * tiles (space + a moment beneath each), revealed with a gentle stagger.
 * Reduced-motion safe.
 */
export function PlacementGrid({ settings }: SectionComponentProps) {
  const s = settings as unknown as PlacementGridSettings;
  const reduce = useReducedMotion();
  if (!s.items?.length) return null;

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.18 } },
  };
  const tile: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] } },
  };

  return (
    <div className="placement">
      <div className="placement__head">
        {s.eyebrow ? <p className="placement__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="placement__heading">{s.heading}</h2> : null}
      </div>
      <motion.div
        className="placement__grid"
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      >
        {s.items.map((item) => (
          <motion.div key={item.label} className="placement__item" variants={tile}>
            <span className="placement__rule" aria-hidden="true" />
            <p className="placement__label">{item.label}</p>
            {item.note ? <p className="placement__note">{item.note}</p> : null}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
