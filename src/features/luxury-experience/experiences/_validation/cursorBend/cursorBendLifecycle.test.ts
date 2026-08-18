/**
 * Phase 3.3 — Cursor Bend Validation · runtime lifecycle invariants.
 *
 * Node env with stubbed globals (no jsdom): a fake container/window record listeners, and a controllable
 * requestAnimationFrame lets us flush frames deterministically. Verifies pointer lifecycle (1 on mount / 0 on
 * unmount / no duplicates), transform reset-to-neutral, rAF coalescing (≤ one update per frame), and that the
 * pointer handler performs NO layout read (getBoundingClientRect happens only inside the rAF flush).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createCursorBendDriver } from "./cursorBendDriver";
import { MOVEMENT_BUDGET_PX } from "./movementBudget";
import type { LightModulation } from "../../../lighting";

type Handler = (e: unknown) => void;

function fakeTarget() {
  const handlers = new Map<string, Handler[]>();
  return {
    handlers,
    add: (t: string, cb: Handler) => handlers.set(t, [...(handlers.get(t) ?? []), cb]),
    remove: (t: string, cb: Handler) => handlers.set(t, (handlers.get(t) ?? []).filter((f) => f !== cb)),
    count: (t: string) => (handlers.get(t) ?? []).length,
    fire: (t: string, e?: unknown) => (handlers.get(t) ?? []).forEach((cb) => cb(e)),
  };
}

let rafMap: Map<number, FrameRequestCallback>;
let rafId: number;
let rectCalls: number;
const win = fakeTarget();

function flushRAF() {
  const cbs = [...rafMap.values()];
  rafMap.clear();
  cbs.forEach((cb) => cb(0));
}

function makeContainer(width = 200, height = 200) {
  const t = fakeTarget();
  const el = {
    addEventListener: t.add,
    removeEventListener: t.remove,
    getBoundingClientRect: () => {
      rectCalls++;
      return { left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) };
    },
  } as unknown as HTMLElement;
  return { el, t };
}

const px = (v?: string) => parseFloat(v ?? "NaN");

beforeEach(() => {
  rafMap = new Map();
  rafId = 0;
  rectCalls = 0;
  win.handlers.clear();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafMap.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafMap.delete(id));
  vi.stubGlobal("window", { addEventListener: win.add, removeEventListener: win.remove });
});

afterEach(() => vi.unstubAllGlobals());

describe("Pointer lifecycle", () => {
  it("registers exactly one listener per event on mount, zero after unmount", () => {
    const { el, t } = makeContainer();
    const detach = createCursorBendDriver().attach(el, () => {});
    expect(t.count("pointermove")).toBe(1);
    expect(t.count("pointerleave")).toBe(1);
    expect(win.count("blur")).toBe(1);
    detach();
    expect(t.count("pointermove")).toBe(0);
    expect(t.count("pointerleave")).toBe(0);
    expect(win.count("blur")).toBe(0);
  });

  it("mount → 1, unmount → 0, mount again → 1 (no duplicates after Fast Refresh / repeated mounting)", () => {
    const { el, t } = makeContainer();
    const handle = createCursorBendDriver();
    const d1 = handle.attach(el, () => {});
    expect(t.count("pointermove")).toBe(1); // mount → 1
    expect(win.count("blur")).toBe(1);
    d1();
    expect(t.count("pointermove")).toBe(0); // unmount → 0
    expect(win.count("blur")).toBe(0);
    const d2 = handle.attach(el, () => {});
    expect(t.count("pointermove")).toBe(1); // mount again → 1 (never 2)
    expect(win.count("blur")).toBe(1);
    d2();
    expect(t.count("pointermove")).toBe(0);
  });
});

describe("Transform lifecycle", () => {
  it("pointer leave resets the wrapper transform to neutral, leaving no stale bend", () => {
    const { el, t } = makeContainer(); // 200×200, centre (100,100)
    const { driver, attach } = createCursorBendDriver();
    const mods: LightModulation[] = [];
    attach(el, (m) => mods.push(m));

    t.fire("pointermove", { clientX: 200, clientY: 200 }); // bottom-right corner → positive bend
    flushRAF();
    expect(px(mods[mods.length - 1].dx)).toBeGreaterThan(0);

    t.fire("pointerleave");
    expect(mods[mods.length - 1]).toEqual({ dx: "0px", dy: "0px" });
    expect(driver.modulate()).toEqual({ dx: "0px", dy: "0px" }); // no stale state retained
  });
});

describe("Movement Budget", () => {
  it("clamps every computed bend within the budget for any cursor position or viewport size", () => {
    for (const [w, h] of [[50, 50], [200, 200], [2000, 1200]] as const) {
      const { el, t } = makeContainer(w, h);
      let last: LightModulation = {};
      const detach = createCursorBendDriver().attach(el, (m) => (last = m));
      for (const [x, y] of [[-99999, -99999], [0, 0], [w / 2, h / 2], [99999, 99999]] as const) {
        t.fire("pointermove", { clientX: x, clientY: y });
        flushRAF();
        expect(Math.abs(px(last.dx))).toBeLessThanOrEqual(MOVEMENT_BUDGET_PX);
        expect(Math.abs(px(last.dy))).toBeLessThanOrEqual(MOVEMENT_BUDGET_PX);
      }
      detach();
    }
  });

  it("keeps the same LOGICAL budget regardless of devicePixelRatio / zoom / screen size", () => {
    vi.stubGlobal("devicePixelRatio", 3); // a hi-DPR / zoomed display must NOT scale the budget
    for (const [w, h] of [[300, 300], [1920, 1080]] as const) {
      const { el, t } = makeContainer(w, h);
      let last: LightModulation = {};
      const detach = createCursorBendDriver().attach(el, (m) => (last = m));
      t.fire("pointermove", { clientX: 99999, clientY: 99999 }); // far past the edge → the extreme
      flushRAF();
      expect(px(last.dx)).toBe(MOVEMENT_BUDGET_PX); // exactly the cap — not cap × dpr, not size-scaled
      expect(px(last.dy)).toBe(MOVEMENT_BUDGET_PX);
      detach();
    }
  });
});

describe("Performance", () => {
  it("coalesces multiple moves into at most one transform update per frame", () => {
    const { el, t } = makeContainer();
    let calls = 0;
    createCursorBendDriver().attach(el, () => calls++);
    t.fire("pointermove", { clientX: 120, clientY: 120 });
    t.fire("pointermove", { clientX: 140, clientY: 140 });
    t.fire("pointermove", { clientX: 160, clientY: 160 });
    expect(rafMap.size).toBe(1); // one frame scheduled for three moves
    expect(calls).toBe(0); // nothing applied until the frame runs
    flushRAF();
    expect(calls).toBe(1); // exactly one update this frame
    t.fire("pointermove", { clientX: 100, clientY: 100 });
    expect(rafMap.size).toBe(1); // a subsequent move schedules a fresh single frame
  });

  it("survives a pointer flood — 500 moves keep at most ONE queued frame → exactly one update on flush", () => {
    const { el, t } = makeContainer();
    let calls = 0;
    createCursorBendDriver().attach(el, () => calls++);
    for (let i = 0; i < 500; i++) {
      t.fire("pointermove", { clientX: 100 + (i % 50), clientY: 100 + (i % 30) });
      expect(rafMap.size).toBe(1); // never more than one queued frame at any point in the flood
    }
    expect(calls).toBe(0); // nothing applied mid-flood
    flushRAF();
    expect(calls).toBe(1); // exactly one transform update for the entire burst
    expect(rafMap.size).toBe(0);
  });

  it("performs NO layout read inside the pointer handler (measured only in the rAF flush)", () => {
    const { el, t } = makeContainer();
    createCursorBendDriver().attach(el, () => {});
    t.fire("pointermove", { clientX: 120, clientY: 120 });
    expect(rectCalls).toBe(0); // handler stored coordinates only — no getBoundingClientRect
    flushRAF();
    expect(rectCalls).toBe(1); // measured once, inside the frame
  });

  it("updates only a compositor-friendly transform (translate3d via --lux-* vars; no layout props, no --lx-*)", () => {
    const css = readFileSync(new URL("./cursorBend.css", import.meta.url), "utf8");
    expect(css).toMatch(/transform:\s*translate3d\(var\(--lux-bend-x/);
    expect(css).toMatch(/transition:\s*transform/); // transitions transform only
    expect(css).not.toMatch(/transition:\s*all/);
    expect(css).not.toContain("--lx-bend"); // experience namespace, never engine tokens
  });
});

describe("Memory safety", () => {
  it("repeated mount/unmount cycles leave zero listeners and no pending frame (no retained closures/timers)", () => {
    const { el, t } = makeContainer();
    const handle = createCursorBendDriver();
    for (let i = 0; i < 50; i++) {
      const detach = handle.attach(el, () => {});
      t.fire("pointermove", { clientX: 130, clientY: 130 }); // schedule a frame this cycle
      expect(rafMap.size).toBe(1);
      detach(); // must remove every listener AND cancel the pending frame
      expect(t.count("pointermove")).toBe(0);
      expect(t.count("pointerleave")).toBe(0);
      expect(win.count("blur")).toBe(0);
      expect(rafMap.size).toBe(0); // no retained timer survives detach
    }
  });
});
