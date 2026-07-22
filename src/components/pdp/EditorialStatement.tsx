"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Fragment } from "react";
import { ParallaxMedia } from "@/components/ui/ParallaxMedia";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { EditorialStatementSettings } from "@/lib/productEditorial";
import { revealProps } from "./reveal";

/** Render single "\n" line breaks within a paragraph as <br> (stanza lines). */
function withBreaks(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {line}
      {i < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

/**
 * EditorialStatement (block, client) — a large editorial paragraph beside one
 * image, or full-width text when `align: "none"`. The reusable "Story Within" /
 * "The Experience" beat. The text lines reveal one after another (fade + gentle
 * rise) for a cinematic scroll; the image keeps its own parallax. Themed by
 * SectionShell. Reduced-motion safe.
 */
export function EditorialStatement({ settings, context }: SectionComponentProps) {
  const s = settings as unknown as EditorialStatementSettings;
  const reduce = useReducedMotion();
  if (!s.body?.length) return null;
  const withMedia = Boolean(s.media?.src) && s.align !== "none";

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.18 } },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.25, 0.1, 0.25, 1] } },
  };

  return (
    <div className="estatement" data-align={withMedia ? s.align : "none"}>
      {withMedia ? (
        <div className="estatement__media">
          <ParallaxMedia src={s.media!.src} alt={s.media!.alt ?? ""} role="lifestyle" imageClassName="estatement__image" range={22} />
        </div>
      ) : null}
      <motion.div
        className="estatement__body"
        variants={container}
        {...revealProps(context?.preview)}
      >
        {s.eyebrow ? <motion.p className="estatement__eyebrow" variants={item}>{s.eyebrow}</motion.p> : null}
        {s.heading ? <motion.h2 className="estatement__heading" variants={item}>{s.heading}</motion.h2> : null}
        {s.body.map((p, i) => (
          <motion.p key={i} className="estatement__para" variants={item}>{withBreaks(p)}</motion.p>
        ))}
      </motion.div>
    </div>
  );
}
