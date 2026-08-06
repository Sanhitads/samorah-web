import { describe, it, expect } from "vitest";
import {
  liveReserved, protectedReserved, available, computeAdjustment, sellabilityStatus, systemMovementKey, crossedLowStock,
  type Hold,
} from "./adjustLogic";

const NOW = 1_000_000_000_000;
const live = (q: number): Hold => ({ quantity: q, expiresAtMs: NOW + 60_000, orderPayable: false });
const expiredCartHold = (q: number): Hold => ({ quantity: q, expiresAtMs: NOW - 60_000, orderPayable: false });
const expiredButPayable = (q: number): Hold => ({ quantity: q, expiresAtMs: NOW - 60_000, orderPayable: true }); // slow payment (Blocker C)

describe("Inventory algebra — invariant-by-invariant (Phase 0)", () => {
  it("INV-6/INV-12: Reserved(live)=unexpired only; Available=OnHand−Reserved(live), floored", () => {
    const holds = [live(2), expiredCartHold(5)];
    expect(liveReserved(holds, NOW)).toBe(2); // expired cart hold does not count
    expect(available(10, liveReserved(holds, NOW))).toBe(8);
    expect(available(1, 5)).toBe(0); // floored, never negative
  });

  it("INV-11: protected floor includes a slow-payment (expired-but-payable) hold, excludes orphans", () => {
    const slow = [expiredButPayable(3)];
    expect(liveReserved(slow, NOW)).toBe(0); // storefront sees it as free (existing checkout reality)
    expect(protectedReserved(slow, NOW)).toBe(3); // admin floor still protects it
    const orphan = [expiredCartHold(3)]; // expired, NOT payable (order left the lifecycle)
    expect(protectedReserved(orphan, NOW)).toBe(0); // orphan must NOT freeze stock
  });

  it("INV-12: protected floor and live reserved are distinct quantities (not collapsed)", () => {
    const mixed = [live(2), expiredButPayable(3)];
    expect(liveReserved(mixed, NOW)).toBe(2);
    expect(protectedReserved(mixed, NOW)).toBe(5);
  });

  it("INV-2: REMOVE/SET can never drive on-hand below zero", () => {
    expect(computeAdjustment("remove", 12, 10, 0)).toMatchObject({ ok: false, reason: "negative_stock" });
    // 'set' cannot go negative because qty>=0 is required; a negative qty is bad_request
    expect(computeAdjustment("set", -1 as unknown as number, 10, 0)).toMatchObject({ ok: false, reason: "bad_request" });
  });

  it("INV-3: REMOVE/SET rejected when result < PROTECTED reserved (with an active hold)", () => {
    // on-hand 10, protected reserved 4 → cannot set below 4 or remove below 4
    expect(computeAdjustment("set", 3, 10, 4)).toMatchObject({ ok: false, reason: "below_reserved", reserved: 4, attempted: 3 });
    expect(computeAdjustment("remove", 7, 10, 4)).toMatchObject({ ok: false, reason: "below_reserved", attempted: 3 });
    // exactly at the floor is allowed
    expect(computeAdjustment("set", 4, 10, 4)).toEqual({ ok: true, after: 4, delta: -6 });
  });

  it("arithmetic: every successful result satisfies after = before + delta (matches DB CHECK)", () => {
    for (const [mode, qty, before] of [["add", 5, 10], ["remove", 3, 10], ["set", 7, 10]] as const) {
      const r = computeAdjustment(mode, qty, before, 0);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.after).toBe(before + r.delta);
    }
  });

  it("bad input + zero-delta guards", () => {
    expect(computeAdjustment("bogus" as unknown as "add", 1, 10, 0)).toMatchObject({ ok: false, reason: "bad_request" });
    expect(computeAdjustment("add", 0, 10, 0)).toMatchObject({ ok: false, reason: "zero_quantity" });
    expect(computeAdjustment("set", 0, 10, 0)).toEqual({ ok: true, after: 0, delta: -10 }); // set-to-zero is legitimate (needs reserved 0)
  });

  it("D1: sellability status derives from AVAILABLE, not on-hand", () => {
    expect(sellabilityStatus(0, 5)).toBe("out_of_stock");
    expect(sellabilityStatus(5, 5)).toBe("low_stock");
    expect(sellabilityStatus(6, 5)).toBe("in_stock");
    // on-hand 6 but 6 reserved → available 0 → out_of_stock, even though on-hand alert would say "low"
    expect(sellabilityStatus(available(6, 6), 5)).toBe("out_of_stock");
  });

  it("§2: low-stock fires on a downward On-Hand crossing (manual OR sale), never while merely below", () => {
    const T = 5;
    expect(crossedLowStock(8, 5, T)).toBe(true);   // manual remove 8→5 crosses
    expect(crossedLowStock(6, 5, T)).toBe(true);   // a sale 6→5 crosses (On Hand drops at finalize)
    expect(crossedLowStock(6, 0, T)).toBe(true);   // straight to out-of-stock, still one crossing
    expect(crossedLowStock(5, 3, T)).toBe(false);  // already below → NO re-fire (anti-storm)
    expect(crossedLowStock(3, 1, T)).toBe(false);  // still below → no re-fire
    expect(crossedLowStock(2, 0, T)).toBe(false);  // below→out while already below → no re-fire
    expect(crossedLowStock(5, 12, T)).toBe(false); // increase never fires
  });

  it("INV-9/req#4: return keys are per-return_id → partial returns of the same variant are distinct", () => {
    expect(systemMovementKey("return", "RET-1", "VAR-A")).toBe("return:RET-1:VAR-A");
    expect(systemMovementKey("return", "RET-2", "VAR-A")).toBe("return:RET-2:VAR-A");
    expect(systemMovementKey("return", "RET-1", "VAR-A")).not.toBe(systemMovementKey("return", "RET-2", "VAR-A"));
    // a retry of the SAME return+variant collides (suppressed) — exactly-once
    expect(systemMovementKey("sale", "ORD-9", "VAR-A")).toBe("sale:ORD-9:VAR-A");
    expect(systemMovementKey("opening", "VAR-A")).toBe("opening:VAR-A");
  });
});
