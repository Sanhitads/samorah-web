"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Storefront page transition.
 *
 * A SUBORDINATE navigation polish: the destination content gently fades in on
 * CLIENT-SIDE navigation only. Deliberately **opacity-only** — no transform, no
 * layout/geometry change, no scroll change.
 *
 * Why opacity-only (not a translateY): the storefront has many `position: sticky`
 * (PDP buy-box, checkout summary, bundle) and `position: fixed` bars. A persistent
 * wrapper `transform` would create a CSS containing block that relocates/breaks
 * those. `opacity` creates **neither** a containing block for `fixed` **nor** a
 * scroll container for `sticky`, so navigation geometry and scroll position are
 * provably untouched.
 *
 * Keyed by `usePathname()`: Next.js App Router re-instantiates a `template.tsx`
 * only when its direct child segment changes — so navigating DEEPER within the
 * same first segment (`/shop` → `/shop/[slug]`, or PDP → PDP) REUSES this template
 * and, without a key, no fresh mount / no fade. Keying the motion wrapper on the
 * pathname makes a NEW element on every path change, so the enter fade fires on
 * every client navigation, including intra-segment ones. The storefront chrome
 * lives in `(store)/layout.tsx` (which PERSISTS) and never transitions. The Match
 * Strike Intro and all lighting are untouched — no lighting, no public API, no dep.
 *
 * Values mirror the Motion Design System's content-entrance (`components/ui/Reveal`):
 * `--motion-reveal-duration` (0.8s) + `--motion-ease-out` — no new token.
 *
 * Reduced motion → no transition at all (instant, fully visible), via framer's
 * `useReducedMotion()` (the single canonical reduced-motion authority).
 */

// `false` during the initial document load; `true` after the first client-side
// navigation. Module-scope, so it survives template re-mounts/reuse. SSR and the
// first client (hydration) render both read `false` → the initial paint renders
// fully visible (no invisible-then-fade flash, no hydration gap). The fade is a
// client-navigation enhancement only. Read at render time (not snapshotted) so a
// keyed re-mount on a REUSED template still reflects the live navigation state.
let hasNavigated = false;

const DURATION = 0.8; // --motion-reveal-duration
const EASE_OUT = [0, 0, 0.2, 1] as const; // --motion-ease-out (mirrors `Reveal`)

export default function StoreTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    hasNavigated = true;
  }, []);

  // Fade ONLY on a client navigation with motion allowed. On the initial load —
  // or under reduced motion — `initial={false}` makes framer render at the target
  // (opacity 1) with no animation: visible on first paint, SSR-consistent, no
  // hydration mismatch, no movement. The initial-load motion element mounts once
  // (key = the entry pathname) while `hasNavigated` is `false`, so it never fades;
  // each subsequent pathname change re-mounts it with `hasNavigated === true`.
  const animateEntrance = hasNavigated && !reduceMotion;

  return (
    <motion.div
      key={pathname}
      className="lux-page-transition"
      initial={animateEntrance ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
