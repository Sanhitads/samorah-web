"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { PoeticLinesSettings } from "@/lib/productEditorial";
import { revealProps } from "./reveal";

/**
 * PoeticLines (block, client) — short lines read like verse, revealed one after
 * another (fade + gentle rise) as the section scrolls in. The "Feels Like" beat.
 * Reduced-motion safe.
 */
export function PoeticLines({ settings, context }: SectionComponentProps) {
  const s = settings as unknown as PoeticLinesSettings;
  const reduce = useReducedMotion();
  if (!s.lines?.length) return null;

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.28 } },
  };
  const line: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.25, 0.1, 0.25, 1] } },
  };

  return (
    <div className="poetic">
      {s.eyebrow ? <p className="poetic__eyebrow">{s.eyebrow}</p> : null}
      <motion.div
        className="poetic__lines"
        variants={container}
        {...revealProps(context?.preview)}
      >
        {s.lines.map((l, i) => (
          <motion.p key={i} className="poetic__line" variants={line}>{l}</motion.p>
        ))}
      </motion.div>
    </div>
  );
}
