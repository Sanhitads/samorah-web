"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

// Editorial luxury signals — a quiet rotation, not a promotional ticker
// (SDD-VISUAL §1: static, centred, NO marquee). Curated here for now; later
// sourced from settings / the Banner Manager. Policy-neutral by design — no
// shipping threshold is asserted until it's driven by store settings.
const MESSAGES = [
  "Crafted to transform atmosphere into ritual",
  "Handcrafted in India · Composed with intention",
  "Soy-coconut wax · Lead-free cotton wicks",
] as const;

const ROTATE_MS = 5000;
const EASE_OUT = [0, 0, 0.2, 1] as const; // --ease-out (SDD §8.1)

export function AnnouncementBar() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion || MESSAGES.length < 2) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % MESSAGES.length),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [reduceMotion]);

  // A single still signal — no rotation, no fade — whenever there's nothing to rotate
  // (reduced-motion preference, or only one message). Otherwise a fade rotation.
  const still = reduceMotion || MESSAGES.length < 2;

  return (
    <div className="announcement-bar">
      {still ? (
        <span className="announcement-bar__message">{MESSAGES[0]}</span>
      ) : (
        // mode="wait": the outgoing message fully fades out BEFORE the next mounts, so two
        // messages are never on screen at once (no ghosting/overlap). Both are absolutely
        // positioned + centred, so there is never a layout jump between messages.
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={index}
            className="announcement-bar__message"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            {MESSAGES[index]}
          </motion.span>
        </AnimatePresence>
      )}
    </div>
  );
}
