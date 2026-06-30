"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { AssetImage } from "@/components/ui/AssetImage";
import type { ImageRole } from "@/platform/asset";

/**
 * ParallaxMedia (Atom) — wraps AssetImage in an extremely subtle scroll parallax
 * (the image drifts a few px slower than the page) so editorial photography
 * breathes. The inner layer is over-sized by `range` on each edge so the drift
 * never reveals a gap. Respects prefers-reduced-motion (no movement). The parent
 * supplies the frame (aspect-ratio + overflow: hidden); this fills it.
 */
export function ParallaxMedia({
  src,
  alt,
  role = "lifestyle",
  imageClassName,
  range = 16,
}: {
  src: string;
  alt?: string;
  role?: ImageRole;
  imageClassName?: string;
  range?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [range, -range]);

  return (
    <div ref={ref} className="parallax-media" aria-hidden="true">
      <motion.div
        className="parallax-media__inner"
        style={{
          y: reduce ? 0 : y,
          top: -range,
          bottom: -range,
          willChange: "transform",
        }}
      >
        <AssetImage asset={src} alt={alt} role={role} className={imageClassName} />
      </motion.div>
    </div>
  );
}
