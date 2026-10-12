"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { safeHref } from "@/lib/safeHref";

// Editorial luxury signals — a quiet rotation, not a promotional ticker
// (SDD-VISUAL §1: static, centred, NO marquee). This curated rotation is the
// DEFAULT; an admin can override it with a single custom message from
// Admin → Settings → Announcement bar (see AnnouncementConfig below).
const MESSAGES = [
  "Crafted to transform atmosphere into ritual",
  "Handcrafted in India · Composed with intention",
  "Soy-coconut wax · Lead-free cotton wicks",
] as const;

const ROTATE_MS = 5000;
const EASE_OUT = [0, 0, 0.2, 1] as const; // --ease-out (SDD §8.1)

/**
 * Site Settings announcement (Admin → Settings → "Announcement bar").
 * When `active` is on AND `text` is non-empty, that single message OVERRIDES the curated rotation
 * (optionally linked). Otherwise the rotation shows — so the bar is never empty and existing
 * behaviour is preserved for stores that haven't set a custom message.
 */
export interface AnnouncementConfig {
  text?: string;
  link?: string;
  active?: boolean;
  /** Hide the announcement bar entirely (Admin → Settings). The layout drops its 38px offset to match. */
  hidden?: boolean;
}

export function AnnouncementBar({ announcement }: { announcement?: AnnouncementConfig }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  const custom = announcement?.active && announcement.text?.trim() ? announcement.text.trim() : null;

  useEffect(() => {
    // No rotation when a custom message is set, under reduced-motion, or with a single message.
    if (custom || reduceMotion || MESSAGES.length < 2) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % MESSAGES.length),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [custom, reduceMotion]);

  // Fully hidden (admin opt-in) — render nothing. (Hooks above still run, so this is hook-safe.)
  if (announcement?.hidden) return null;

  // Admin-set announcement — a single, still message (no rotation), optionally linked.
  if (custom) {
    const href = announcement?.link?.trim() ? safeHref(announcement.link.trim()) : null;
    return (
      <div className="announcement-bar">
        {href && href !== "#" ? (
          <a className="announcement-bar__message announcement-bar__message--link" href={href}>{custom}</a>
        ) : (
          <span className="announcement-bar__message">{custom}</span>
        )}
      </div>
    );
  }

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
