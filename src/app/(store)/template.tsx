"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Storefront page transition — Commit 1 (technical proof).
 *
 * A SUBORDINATE navigation polish: the destination content gently fades in on
 * CLIENT-SIDE navigation only. Deliberately **opacity-only** — no transform, no
 * layout/geometry change, no scroll change.
 *
 * Why opacity-only (not the tiny translateY the review sketched): the storefront
 * has many `position: sticky` (PDP buy-box, checkout summary, bundle) and
 * `position: fixed` bars. A persistent wrapper `transform` would create a CSS
 * containing block that relocates/breaks those. `opacity` creates **neither** a
 * containing block for `fixed` **nor** a scroll container for `sticky`, so
 * navigation geometry and scroll position are provably untouched. (A rise, if
 * ever wanted, must use a transform cleared to `none` at rest and be verified
 * against those elements — a separate, reviewed step, not Commit 1.)
 *
 * Scope: `template.tsx` re-mounts on every navigation, so the enter runs per
 * route change; the storefront chrome lives in `(store)/layout.tsx` (which
 * PERSISTS) and never transitions. The Match Strike Intro and all lighting are
 * untouched — this file adds no lighting, no public API, no dependency.
 *
 * Values mirror the Motion Design System's content-entrance (`components/ui/Reveal`):
 * `--motion-reveal-duration` (0.8s) + `--motion-ease-out` — no new token.
 *
 * Reduced motion → no transition at all (instant, fully visible), via framer's
 * `useReducedMotion()` (the single canonical reduced-motion authority).
 */

// `false` during the initial document load; `true` after the first client-side
// navigation. Module-scope, so it survives template re-mounts. SSR and the first
// client (hydration) render both read `false` → the initial paint renders fully
// visible (no invisible-then-fade flash, no hydration gap). The fade is a
// client-navigation enhancement only.
let hasNavigated = false;

const DURATION = 0.8; // --motion-reveal-duration
const EASE_OUT = [0, 0, 0.2, 1] as const; // --motion-ease-out (mirrors `Reveal`)

export default function StoreTemplate({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  // Snapshot the flag for THIS mount, before the post-mount effect flips it.
  const isNavigation = useRef(hasNavigated).current;

  useEffect(() => {
    hasNavigated = true;
  }, []);

  // Fade ONLY on a client navigation with motion allowed. On the initial load —
  // or under reduced motion — `initial={false}` makes framer render at the target
  // (opacity 1) with no animation: visible on first paint, SSR-consistent, no
  // hydration mismatch, no movement.
  const animateEntrance = isNavigation && !reduceMotion;

  return (
    <motion.div
      className="lux-page-transition"
      initial={animateEntrance ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
