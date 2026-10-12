"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { safeHref } from "@/lib/safeHref";

/**
 * Announcement bar — a quiet, centred rotation (SDD-VISUAL §1: static, NO marquee).
 *
 * The rotating lines are admin-managed (Admin → Settings → "Announcement bar"): set any number of
 * `messages` and they rotate; leave them empty and the built-in DEFAULT_MESSAGES below show instead,
 * so the bar is never blank. An optional `link` makes the whole bar clickable; `hidden` removes it.
 */
const DEFAULT_MESSAGES = [
  "Fragrance inspired by places, memories and everyday life",
  "Made in India · In small batches",
  "Coconut-based wax blend · Cotton wicks",
] as const;

const ROTATE_MS = 5000;
const EASE_OUT = [0, 0, 0.2, 1] as const; // --ease-out (SDD §8.1)

export interface AnnouncementConfig {
  messages?: string[];
  link?: string;
  hidden?: boolean;
}

// Only honour a link that actually looks like a destination (not stray copy pasted into the field).
// safeHref then neutralises any unsafe scheme.
const LOOKS_LIKE_LINK = /^(https?:\/\/|\/|#|mailto:|tel:)/i;

export function AnnouncementBar({ announcement }: { announcement?: AnnouncementConfig }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  const custom = (announcement?.messages ?? []).map((m) => (m ?? "").trim()).filter(Boolean);
  const lines: readonly string[] = custom.length ? custom : DEFAULT_MESSAGES;

  useEffect(() => {
    // Rotate only when there are 2+ lines and motion is allowed.
    if (reduceMotion || lines.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % lines.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [reduceMotion, lines.length]);

  // Fully hidden (admin opt-in) — render nothing. (Hooks above still run, so this is hook-safe.)
  if (announcement?.hidden) return null;

  const idx = index % lines.length;
  const rawLink = announcement?.link?.trim();
  const sanitized = rawLink && LOOKS_LIKE_LINK.test(rawLink) ? safeHref(rawLink) : null;
  const href = sanitized && sanitized !== "#" ? sanitized : null;
  const cls = `announcement-bar__message${href ? " announcement-bar__message--link" : ""}`;

  // A single rotating slide (optionally a link). mode="wait" keeps two messages from overlapping.
  const slide = (text: string) =>
    href ? (
      <motion.a key={idx} href={href} className={cls} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }}>
        {text}
      </motion.a>
    ) : (
      <motion.span key={idx} className={cls} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }}>
        {text}
      </motion.span>
    );

  // Static (one line, or reduced motion) → no rotation, no fade.
  const still = reduceMotion || lines.length < 2;

  return (
    <div className="announcement-bar">
      {still ? (
        href ? <a className={cls} href={href}>{lines[0]}</a> : <span className={cls}>{lines[0]}</span>
      ) : (
        <AnimatePresence mode="wait" initial={false}>{slide(lines[idx])}</AnimatePresence>
      )}
    </div>
  );
}
