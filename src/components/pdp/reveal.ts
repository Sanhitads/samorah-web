import type { MotionProps } from "framer-motion";

/**
 * Scroll-reveal props for PDP sections. On the live storefront the content fades/rises in as it
 * scrolls into view (whileInView, once). Inside the admin's LIVE PREVIEW that same reveal breaks:
 * when a draft edit re-renders a section it resets to its hidden (opacity:0) state but, already being
 * in view, never receives a scroll to re-trigger — so the text vanishes. In preview we therefore skip
 * the reveal and render the final "show" state statically, so every edit stays visible.
 */
export function revealProps(preview: boolean | undefined, margin = "0px 0px -100px 0px"): MotionProps {
  return preview
    ? { initial: "show", animate: "show" }
    : { initial: "hidden", whileInView: "show", viewport: { once: true, margin } };
}
