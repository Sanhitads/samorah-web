import { describe, it, expect } from "vitest";
import { validateDispatch } from "@/lib/settings/dispatchValidation";

const ok = { cutoffTime: "14:00", slaHours: 24 };

describe("validateDispatch (S2A) — corrective validation", () => {
  it("accepts valid cutoff time + SLA (0 allowed)", () => {
    expect(validateDispatch(ok)).toEqual([]);
    expect(validateDispatch({ cutoffTime: "00:00", slaHours: 0 })).toEqual([]);
    expect(validateDispatch({ cutoffTime: "23:59", slaHours: 240 })).toEqual([]);
  });

  it("rejects a malformed cutoff time with a corrective message", () => {
    for (const t of ["9:00", "24:00", "14:60", "1400", "2pm", ""]) {
      const e = validateDispatch({ ...ok, cutoffTime: t });
      expect(e.some((x) => x.field === "cutoffTime"), t).toBe(true);
    }
    expect(validateDispatch({ ...ok, cutoffTime: "9am" })[0].message).toMatch(/HH:MM.*e\.g\. 14:00/);
  });

  it("rejects SLA that is negative / non-integer / over the max, correctively", () => {
    expect(validateDispatch({ ...ok, slaHours: -1 })[0].field).toBe("slaHours");
    expect(validateDispatch({ ...ok, slaHours: 12.5 })[0].field).toBe("slaHours");
    expect(validateDispatch({ ...ok, slaHours: 999 })[0].field).toBe("slaHours");
    expect(validateDispatch({ ...ok, slaHours: NaN })[0].message).toMatch(/between 0 and 240/);
  });

  it("reports both invalid fields at once", () => {
    expect(validateDispatch({ cutoffTime: "bad", slaHours: -5 })).toHaveLength(2);
  });
});
