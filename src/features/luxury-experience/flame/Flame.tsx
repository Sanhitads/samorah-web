import "./flame.css";
import { FlameSvg } from "./FlameSvg";
import { resolveFlameConfig, type FlameConfig } from "./flame.config";

export type FlameProps = Partial<FlameConfig> & { className?: string };

/**
 * Luxury Flame Primitive — the component (Phase 2).
 *
 * A LIGHTWEIGHT wrapper whose only job is to: compose FlameSvg with the glow + motion layers, apply
 * CSS class modifiers, apply size, and render the optional glow. NOT a client component — no hooks,
 * no state, no useEffect, no timers, no rAF, no event listeners, no JS animation. ALL motion lives in
 * flame.css. Decorative (aria-hidden, pointer-events:none), safe to render many times.
 *
 * Visual behaviour is driven by CSS class modifiers, never by conditional render logic:
 *   lux-flame--variant-<v> · lux-flame--theme-<t> · lux-flame--<motionProfile> · lux-flame--<size>
 *   · lux-flame--no-sway. A numeric `size` sets an inline height; aspect-ratio derives the width (no CLS).
 * Phase 2 only "classic" variant and "default" theme have styles; the other classes are dormant seams.
 */
export function Flame({ className, ...overrides }: FlameProps) {
  const cfg = resolveFlameConfig(overrides);
  const sizeIsToken = typeof cfg.size === "string";
  const classes = [
    "lux-flame",
    `lux-flame--variant-${cfg.variant}`,
    `lux-flame--theme-${cfg.theme}`,
    `lux-flame--${cfg.motionProfile}`,
    sizeIsToken ? `lux-flame--${cfg.size}` : null,
    cfg.sway ? null : "lux-flame--no-sway",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const style = sizeIsToken ? undefined : { height: `${cfg.size}px` };

  return (
    <span className={classes} style={style} aria-hidden="true">
      {cfg.glow ? <span className="lux-flame__glow" /> : null}
      <FlameSvg className="lux-flame__svg" />
    </span>
  );
}
