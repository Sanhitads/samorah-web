/**
 * Phase 3.4 — Scroll Breathe runtime lifecycle invariants (node env with stubbed globals + fake timers).
 *
 * Verifies scroll lifecycle (1 listener on mount / 0 on unmount / no duplicates), NO layout read in the
 * handler (getScrollY only at attach + in the rAF flush), scroll-flood coalescing (≤ one frame), neutral
 * reset when scrolling stops (Scroll Idle Rule — exactly once, no oscillation), and memory safety (no
 * retained listeners, frames, or idle timers after detach).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createScrollBreatheDriver, type ScrollTarget } from "./scrollBreatheDriver";
import type { LightModulation } from "../../../lighting";

let rafMap: Map<number, FrameRequestCallback>;
let rafId: number;

function flushRAF() {
  const cbs = [...rafMap.values()];
  rafMap.clear();
  cbs.forEach((cb) => cb(0));
}

function makeScrollTarget(startY = 0) {
  const handlers = new Map<string, Array<() => void>>();
  let y = startY;
  let reads = 0;
  const t = {
    addEventListener: (type: "scroll", cb: () => void) => handlers.set(type, [...(handlers.get(type) ?? []), cb]),
    removeEventListener: (type: "scroll", cb: () => void) =>
      handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== cb)),
    getScrollY: () => {
      reads++;
      return y;
    },
    setY: (n: number) => (y = n),
    fire: () => (handlers.get("scroll") ?? []).forEach((cb) => cb()),
    count: () => (handlers.get("scroll") ?? []).length,
    reads: () => reads,
  };
  return t as ScrollTarget & { setY: (n: number) => void; fire: () => void; count: () => number; reads: () => number };
}

beforeEach(() => {
  vi.useFakeTimers();
  rafMap = new Map();
  rafId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafMap.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafMap.delete(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Scroll lifecycle", () => {
  it("one scroll listener on mount, zero after unmount, mount again → one", () => {
    const target = makeScrollTarget();
    const handle = createScrollBreatheDriver();
    const d1 = handle.attach(target, () => {});
    expect(target.count()).toBe(1);
    d1();
    expect(target.count()).toBe(0);
    const d2 = handle.attach(target, () => {});
    expect(target.count()).toBe(1);
    d2();
    expect(target.count()).toBe(0);
  });

  it("performs NO scroll read inside the handler (getScrollY only at attach + in the rAF flush)", () => {
    const target = makeScrollTarget();
    createScrollBreatheDriver().attach(target, () => {});
    expect(target.reads()).toBe(1); // one read at attach (lastY init)
    target.setY(300);
    target.fire();
    expect(target.reads()).toBe(1); // handler did NOT read
    flushRAF();
    expect(target.reads()).toBe(2); // measured once, in the frame
  });
});

describe("Performance", () => {
  it("survives a scroll flood — 500 events keep ≤ one queued frame → exactly one update on flush", () => {
    const target = makeScrollTarget();
    let calls = 0;
    createScrollBreatheDriver().attach(target, () => calls++);
    for (let i = 0; i < 500; i++) {
      target.setY(i * 3);
      target.fire();
      expect(rafMap.size).toBe(1); // never more than one queued frame during the flood
    }
    expect(calls).toBe(0);
    flushRAF();
    expect(calls).toBe(1); // exactly one update for the entire burst
    expect(rafMap.size).toBe(0);
  });
});

describe("Scroll Idle Rule — neutral reset", () => {
  it("returns to neutral exactly once when scrolling stops (no lingering oscillation)", () => {
    const target = makeScrollTarget();
    const mods: LightModulation[] = [];
    const { driver, attach } = createScrollBreatheDriver();
    attach(target, (m) => mods.push(m));

    target.setY(400);
    target.fire();
    flushRAF();
    expect(mods[mods.length - 1].dIntensity ?? 0).toBeGreaterThan(0); // active scroll → breath > 0

    const before = mods.length;
    vi.advanceTimersByTime(500); // past the idle window
    expect(mods[mods.length - 1].dIntensity).toBe(0); // returned to neutral
    expect(mods.length).toBe(before + 1); // fired exactly once — no oscillation
    expect(driver.modulate()).toEqual({ dIntensity: 0 });
  });
});

describe("Memory safety", () => {
  it("repeated attach/detach cycles leave zero listeners, no pending frame, no pending idle timer", () => {
    const target = makeScrollTarget();
    const handle = createScrollBreatheDriver();
    for (let i = 0; i < 50; i++) {
      const detach = handle.attach(target, () => {});
      target.setY(i * 20);
      target.fire();
      flushRAF(); // schedules the idle timer
      expect(vi.getTimerCount()).toBe(1);
      detach();
      expect(target.count()).toBe(0);
      expect(rafMap.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0); // idle timer cleared on detach — no retained timer
    }
  });

  it("detach cancels an in-flight (unflushed) frame", () => {
    const target = makeScrollTarget();
    const detach = createScrollBreatheDriver().attach(target, () => {});
    target.setY(100);
    target.fire();
    expect(rafMap.size).toBe(1);
    detach();
    expect(rafMap.size).toBe(0);
  });
});
