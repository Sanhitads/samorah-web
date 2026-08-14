/**
 * Luxury Flame Primitive — SVG artwork (Phase 2, "classic" variant).
 *
 * COMPLETELY STATIC: pure SVG geometry — no animation, no CSS file, no JavaScript, no timers, no
 * motion. Motion and glow are layered on in commit 3 (flame.css) by targeting the element classes
 * below; themes (Phase 2.x) recolour by overriding the --lux-flame-* custom properties. Fills use
 * var() with a hex fallback, so the artwork renders correctly BOTH standalone and inside a themed
 * .lux-flame container — without introducing a stylesheet here.
 *
 * Coordinate system — viewBox "0 0 40 64" (5:8, portrait), resolution-independent (scales xs–xl):
 *   • origin top-left; x → right, y → down.
 *   • wick base sits at horizontal-centre / bottom (x=20, y≈61) — the natural motion anchor
 *     (transform-origin: bottom center) used by the sway/flicker added in commit 3.
 *   • flame tip at (20, 6).
 *
 * Three independent elements so themes and motion can target each on its own:
 *   • .lux-flame__wick   — the charred wick (drawn first, behind the flame)
 *   • .lux-flame__body   — the outer flame (amber)
 *   • .lux-flame__inner  — the inner core (bright)
 *
 * Decorative: aria-hidden + focusable="false"; contains no interactive or focusable nodes.
 */
export function FlameSvg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className="lux-flame__wick"
        x="19.25"
        y="52"
        width="1.5"
        height="9"
        rx="0.75"
        fill="var(--lux-flame-wick, #3a2a1a)"
      />
      <path
        className="lux-flame__body"
        d="M20 6 C24 18 31 26 31 40 C31 50 26 55 20 55 C14 55 9 50 9 40 C9 26 16 18 20 6 Z"
        fill="var(--lux-flame-amber, #d6aa54)"
      />
      <path
        className="lux-flame__inner"
        d="M20 22 C22.5 30 26 34 26 42 C26 48 23 51 20 51 C17 51 14 48 14 42 C14 34 17.5 30 20 22 Z"
        fill="var(--lux-flame-core, #ffd9a0)"
      />
    </svg>
  );
}
