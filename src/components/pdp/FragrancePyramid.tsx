"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { FragrancePyramidSettings } from "@/lib/productEditorial";

/**
 * FragrancePyramid (block, client) — the Top / Heart / Base composition as an
 * editorial pyramid. The layers reveal in sequence as it scrolls into view
 * (Top first, then Heart, then Base) with a gentle opacity + translate only —
 * no flashy effects, reduced-motion safe.
 */
export function FragrancePyramid({ settings }: SectionComponentProps) {
  const s = settings as unknown as FragrancePyramidSettings;
  const reduce = useReducedMotion();
  if (!s.layers?.length) return null;

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.35 } },
  };
  const layer: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.25, 0.1, 0.25, 1] } },
  };

  return (
    <div className="pyramid">
      <div className="pyramid__head">
        {s.eyebrow ? <p className="pyramid__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="pyramid__heading">{s.heading}</h2> : null}
        {s.intro ? <p className="pyramid__intro">{s.intro}</p> : null}
      </div>
      <motion.div
        className="pyramid__layers"
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "0px 0px -100px 0px" }}
      >
        {s.layers.map((l) => (
          <motion.div key={l.label} className="pyramid__layer" variants={layer}>
            <p className="pyramid__layer-label">{l.label}</p>
            <ul className="pyramid__notes">
              {l.notes.map((n) => (
                <li key={n} className="pyramid__note">{n}</li>
              ))}
            </ul>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
