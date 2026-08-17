/**
 * Ambient Lighting Engine — capability model (Phase 3.0, architecture only).
 *
 * Maps the shared motion tier onto a lighting tier. The Capability Manager is a GOVERNOR (see the Driver
 * Resolution Contract): it can force `dim` / `off`, overriding every source and driver — accessibility can
 * never be out-voted. Pure + SSR-safe (detectMotionTier returns "full" on the server). No runtime behavior
 * is triggered here; nothing calls this in Phase 3.0.
 */
import { detectMotionTier } from "../engine/capability";

/** on = full lighting · dim = static/gentle (reduced-motion / low-power) · off = no light. */
export type LightingTier = "on" | "dim" | "off";

export function resolveLightingTier(): LightingTier {
  switch (detectMotionTier()) {
    case "off":
      return "off";
    case "reduced":
      return "dim";
    default:
      return "on";
  }
}
