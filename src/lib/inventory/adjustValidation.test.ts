import { describe, it, expect } from "vitest";
import { validateAdjustInput, MAX_REFERENCE, MAX_NOTE } from "./adjustValidation";

describe("manual adjustment validation (Phase 1A §3)", () => {
  it("accepts a canonical reason and returns trimmed clean fields", () => {
    const r = validateAdjustInput({ mode: "add", qty: 5, reason: "Stock received", reference: "  GRN-1  ", note: "  ok  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.clean).toEqual({ mode: "add", qty: 5, reason: "Stock received", reference: "GRN-1", note: "ok" });
  });

  it("REJECTS system/return reasons as manual", () => {
    for (const bad of ["Return restocked", "RTO restocked", "sale", "return_restock", "rto_restock", "opening_balance", "cancel_restock"]) {
      expect(validateAdjustInput({ mode: "add", qty: 1, reason: bad })).toMatchObject({ ok: false });
    }
  });

  it("requires a note when reason is Other", () => {
    expect(validateAdjustInput({ mode: "remove", qty: 1, reason: "Other" })).toMatchObject({ ok: false });
    expect(validateAdjustInput({ mode: "remove", qty: 1, reason: "Other", note: "x" })).toMatchObject({ ok: false }); // too short
    expect(validateAdjustInput({ mode: "remove", qty: 1, reason: "Other", note: "spillage" }).ok).toBe(true);
  });

  it("rejects bad mode / negative / non-integer qty", () => {
    expect(validateAdjustInput({ mode: "bogus", qty: 1, reason: "Damaged" })).toMatchObject({ ok: false });
    expect(validateAdjustInput({ mode: "add", qty: -1, reason: "Damaged" })).toMatchObject({ ok: false });
    expect(validateAdjustInput({ mode: "add", qty: 1.5, reason: "Damaged" })).toMatchObject({ ok: false });
  });

  it("bounds reference and note length", () => {
    expect(validateAdjustInput({ mode: "add", qty: 1, reason: "Damaged", reference: "x".repeat(MAX_REFERENCE + 1) })).toMatchObject({ ok: false });
    expect(validateAdjustInput({ mode: "add", qty: 1, reason: "Damaged", note: "x".repeat(MAX_NOTE + 1) })).toMatchObject({ ok: false });
  });
});
