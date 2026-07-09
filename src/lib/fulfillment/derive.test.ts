import { describe, it, expect } from "vitest";
import { effectivePriority, queueOf, nextActionLabel, refundBadge } from "@/lib/fulfillment/derive";

describe("effectivePriority — max(manual, computed)", () => {
  it("manual VIP/Urgent → Critical", () => {
    expect(effectivePriority("vip", { slaTone: "ok", tags: [] })).toBe("critical");
    expect(effectivePriority("urgent", { slaTone: "ok", tags: [] })).toBe("critical");
  });
  it("SLA breach escalates a Normal order to Critical without manual input", () => {
    expect(effectivePriority("normal", { slaTone: "over", tags: [] })).toBe("critical");
  });
  it("Complaint tag → Critical; Express/Replacement → High", () => {
    expect(effectivePriority("normal", { slaTone: "ok", tags: ["Complaint"] })).toBe("critical");
    expect(effectivePriority("normal", { slaTone: "ok", tags: ["Express"] })).toBe("high");
    expect(effectivePriority("normal", { slaTone: "ok", tags: ["Replacement"] })).toBe("high");
  });
  it("manual override never lowers a computed escalation", () => {
    // normal manual but SLA warn → High, not Normal
    expect(effectivePriority("normal", { slaTone: "warn", tags: [] })).toBe("high");
  });
  it("plain order stays Normal", () => {
    expect(effectivePriority("normal", { slaTone: "ok", tags: ["Gift"] })).toBe("normal");
  });
});

describe("queueOf — functional work queues", () => {
  it("routes by stage", () => {
    expect(queueOf("reserved", "allocated")).toBe("pick");
    expect(queueOf("picking", "allocated")).toBe("pick");
    expect(queueOf("packing", "allocated")).toBe("pack");
    expect(queueOf("ready_for_dispatch", "allocated")).toBe("ship");
  });
  it("exceptions win over stage (QC fail or missing stock)", () => {
    expect(queueOf("qc_failed", "allocated")).toBe("exceptions");
    expect(queueOf("picking", "missing")).toBe("exceptions");
  });
  it("hold is its own queue", () => {
    expect(queueOf("on_hold", "allocated")).toBe("hold");
  });
});

describe("nextActionLabel", () => {
  it("states the single next step", () => {
    expect(nextActionLabel("reserved", null)).toBe("Start picking");
    expect(nextActionLabel("ready_for_dispatch", null)).toBe("Create shipment");
    expect(nextActionLabel("ready_for_dispatch", "courier_assigned")).toBe("Dispatch");
    expect(nextActionLabel("on_hold", null)).toBe("Resume");
  });
});

describe("refundBadge — sub-states", () => {
  it("splits initiated / processing / refunded", () => {
    expect(refundBadge("paid", "initiated")?.label).toBe("Refund Initiated");
    expect(refundBadge("paid", "processing")?.label).toBe("Refund Processing");
    expect(refundBadge("refunded", "processed")?.label).toBe("Refunded");
    expect(refundBadge("partially_refunded", null)?.label).toBe("Part. Refunded");
  });
  it("returns null when there is no refund dimension", () => {
    expect(refundBadge("paid", null)).toBeNull();
  });
});
