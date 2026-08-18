/**
 * Phase 3.4 — Cross-driver coexistence: Cursor Bend (position) + Scroll Breathe (intensity) on ONE wrapper.
 *
 * Composes the FROZEN Cursor Bend driver (imported, not modified) alongside the new Scroll Breathe driver and
 * proves they are orthogonal and both bounded — the concrete example from the Driver Resolution Contract:
 *   Cursor dx = +Npx  ·  Scroll opacity = +Z   →   translate(+Npx, …)  AND  opacity delta (+Z)
 * Neither driver replaces the other; they write disjoint experience-owned vars.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCursorBendDriver } from "../cursorBend/cursorBendDriver";
import { MOVEMENT_BUDGET_PX } from "../cursorBend/movementBudget";
import { createScrollBreatheDriver, type ScrollTarget } from "../../../interactions/scrollBreathe/scrollBreatheDriver";
import { BREATH_BUDGET } from "../../../interactions/scrollBreathe/breathBudget";
import type { LightModulation } from "../../../lighting";

let rafMap: Map<number, FrameRequestCallback>;
let rafId: number;
const winHandlers = new Map<string, Array<() => void>>();

function flushRAF() {
  const cbs = [...rafMap.values()];
  rafMap.clear();
  cbs.forEach((cb) => cb(0));
}

function cursorContainer() {
  const h = new Map<string, Array<(e: unknown) => void>>();
  return {
    el: {
      addEventListener: (t: string, cb: (e: unknown) => void) => h.set(t, [...(h.get(t) ?? []), cb]),
      removeEventListener: (t: string, cb: (e: unknown) => void) => h.set(t, (h.get(t) ?? []).filter((f) => f !== cb)),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }),
    } as unknown as HTMLElement,
    fire: (t: string, e?: unknown) => (h.get(t) ?? []).forEach((cb) => cb(e)),
  };
}

function scrollTarget() {
  const h = new Map<string, Array<() => void>>();
  let y = 0;
  const t = {
    addEventListener: (type: "scroll", cb: () => void) => h.set(type, [...(h.get(type) ?? []), cb]),
    removeEventListener: (type: "scroll", cb: () => void) => h.set(type, (h.get(type) ?? []).filter((f) => f !== cb)),
    getScrollY: () => y,
    setY: (n: number) => (y = n),
    fire: () => (h.get("scroll") ?? []).forEach((cb) => cb()),
  };
  return t as ScrollTarget & { setY: (n: number) => void; fire: () => void };
}

beforeEach(() => {
  vi.useFakeTimers();
  rafMap = new Map();
  rafId = 0;
  winHandlers.clear();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafMap.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafMap.delete(id));
  vi.stubGlobal("window", {
    addEventListener: (t: string, cb: () => void) => winHandlers.set(t, [...(winHandlers.get(t) ?? []), cb]),
    removeEventListener: (t: string, cb: () => void) => winHandlers.set(t, (winHandlers.get(t) ?? []).filter((f) => f !== cb)),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Cross-driver coexistence — Cursor (position) + Scroll (intensity)", () => {
  it("declares disjoint channels — neither can touch the other's channel", () => {
    const cur = createCursorBendDriver();
    const scr = createScrollBreatheDriver();
    const overlap = cur.driver.channels.filter((c) => scr.driver.channels.includes(c));
    expect(overlap).toEqual([]);
    expect([...cur.driver.channels]).toEqual(["position"]);
    expect([...scr.driver.channels]).toEqual(["intensity"]);
  });

  it("both drivers write ONE wrapper without collision — transform AND opacity, both bounded", () => {
    const wrap = new Map<string, string>();
    const container = cursorContainer();
    const target = scrollTarget();

    const cur = createCursorBendDriver();
    const scr = createScrollBreatheDriver();

    cur.attach(container.el, (m: LightModulation) => {
      wrap.set("--lux-bend-x", m.dx ?? "0px");
      wrap.set("--lux-bend-y", m.dy ?? "0px");
    });
    scr.attach(target, (m: LightModulation) => {
      wrap.set("--lux-breathe", String(m.dIntensity ?? 0));
    });

    // Cursor to the bottom-right corner; scroll fast.
    container.fire("pointermove", { clientX: 200, clientY: 200 });
    target.setY(500);
    target.fire();
    flushRAF();

    const bendX = parseFloat(wrap.get("--lux-bend-x") ?? "NaN");
    const bendY = parseFloat(wrap.get("--lux-bend-y") ?? "NaN");
    const breathe = parseFloat(wrap.get("--lux-breathe") ?? "NaN");

    // Position delta bounded by the Movement Budget…
    expect(Math.abs(bendX)).toBeLessThanOrEqual(MOVEMENT_BUDGET_PX);
    expect(Math.abs(bendY)).toBeLessThanOrEqual(MOVEMENT_BUDGET_PX);
    // …intensity delta bounded by the Breath Budget…
    expect(breathe).toBeGreaterThan(0);
    expect(breathe).toBeLessThanOrEqual(BREATH_BUDGET);
    // …and both live side-by-side on the wrapper: neither driver replaced the other.
    expect(wrap.has("--lux-bend-x")).toBe(true);
    expect(wrap.has("--lux-breathe")).toBe(true);
  });
});
