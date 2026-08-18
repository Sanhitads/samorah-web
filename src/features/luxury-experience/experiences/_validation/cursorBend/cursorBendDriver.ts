import type { LightDriver, LightModulation } from "../../../lighting";
import { MOVEMENT_BUDGET_PX, clampToBudget } from "./movementBudget";

/**
 * Phase 3.3 — Cursor Bend Validation · the Cursor Bend DRIVER (validation layer only).
 *
 * Implements the frozen `LightDriver` interface unchanged — it MODULATES an existing light within the
 * Movement Budget and does nothing else:
 *   - `channels: ["position"]` ONLY — it can never touch intensity / colour / profile / radius / blend.
 *   - `modulate()` returns a bounded `{ dx, dy }` (CSS px) — a delta, never an absolute position.
 *   - it creates no light, mounts nothing, and reads no source (Light Source Ownership Contract).
 *
 * "Bend, not follow": the light leans a few px toward presence and springs back; it never arrives at the
 * cursor. Input capture is a passive, rAF-coalesced `pointermove` listener owned HERE (the renderer owns no
 * listeners); it is removed on detach. SSR-safe: no window/document access at import — only inside `attach`,
 * which an Experience calls from an effect.
 */

/** Pure bend calculation: map an offset-from-centre (px) to a budget-bounded delta (px). Testable in node. */
export function computeBend(offsetPx: number, halfExtentPx: number, budgetPx: number = MOVEMENT_BUDGET_PX): number {
  if (!Number.isFinite(offsetPx) || !Number.isFinite(halfExtentPx) || halfExtentPx <= 0) return 0;
  const normalized = offsetPx / halfExtentPx; // ~[-1, 1] inside the container; clamp handles outside
  return clampToBudget(normalized * budgetPx, budgetPx);
}

export interface CursorBendHandle {
  /** The frozen-interface driver (bounded position modulator). */
  readonly driver: LightDriver;
  /** Attach the passive pointer signal to a container; `onModulate` receives the bounded delta. Returns detach. */
  attach(container: HTMLElement, onModulate: (m: LightModulation) => void): () => void;
}

export function createCursorBendDriver(budgetPx: number = MOVEMENT_BUDGET_PX): CursorBendHandle {
  const state = { dx: 0, dy: 0 };

  const driver: LightDriver = {
    id: "cursor-bend",
    channels: ["position"],
    // Driver Resolution Contract order (low → high): Scroll(10) < Cursor(20) < global clamp < a11y override.
    priority: 20,
    modulate: (): LightModulation => ({ dx: `${state.dx}px`, dy: `${state.dy}px` }),
  };

  function attach(container: HTMLElement, onModulate: (m: LightModulation) => void): () => void {
    let frame = 0;
    let pending: { x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const rect = container.getBoundingClientRect();
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;
      state.dx = computeBend(pending.x - (rect.left + halfW), halfW, budgetPx);
      state.dy = computeBend(pending.y - (rect.top + halfH), halfH, budgetPx);
      pending = null;
      onModulate(driver.modulate());
    };

    const onMove = (e: PointerEvent) => {
      pending = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(flush); // coalesce to ≤ one write per frame
    };

    const reset = () => {
      pending = null;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      state.dx = 0;
      state.dy = 0;
      onModulate(driver.modulate()); // ease back to centre (CSS transition owns the easing)
    };

    container.addEventListener("pointermove", onMove, { passive: true });
    container.addEventListener("pointerleave", reset, { passive: true });
    window.addEventListener("blur", reset, { passive: true });

    return () => {
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      if (frame) cancelAnimationFrame(frame);
    };
  }

  return { driver, attach };
}
