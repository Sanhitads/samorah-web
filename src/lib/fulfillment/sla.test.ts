import { describe, it, expect } from "vitest";
import { fulfillmentSla, FULFILLMENT_SLA_HRS } from "@/lib/fulfillment/sla";

const NOW = Date.parse("2026-07-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3.6e6).toISOString();

describe("fulfillment SLA", () => {
  it("judges each order against its PRIORITY target, not a flat age", () => {
    // 12h old: fine for a normal order (48h target), BREACHED for a VIP (12h target).
    expect(fulfillmentSla(hoursAgo(12), "normal", NOW).state).toBe("within");
    expect(fulfillmentSla(hoursAgo(12), "vip", NOW).state).toBe("breached");
  });

  it("within → approaching → breached across the target window", () => {
    // normal target = 48h; approaching at 75% = 36h.
    expect(fulfillmentSla(hoursAgo(10), "normal", NOW)).toMatchObject({ state: "within", label: "Within SLA", tone: "ok" });
    expect(fulfillmentSla(hoursAgo(40), "normal", NOW)).toMatchObject({ state: "approaching", label: "Approaching", tone: "warn" });
    expect(fulfillmentSla(hoursAgo(50), "normal", NOW)).toMatchObject({ state: "breached", label: "Breached", tone: "over" });
  });

  it("reports hours left, negative once breached", () => {
    expect(fulfillmentSla(hoursAgo(10), "normal", NOW).hoursLeft).toBe(38); // 48 - 10
    expect(fulfillmentSla(hoursAgo(60), "normal", NOW).hoursLeft).toBe(-12); // 12h late
  });

  it("unknown priority falls back to the normal target", () => {
    expect(fulfillmentSla(hoursAgo(1), "weird", NOW).targetHrs).toBe(FULFILLMENT_SLA_HRS.normal);
  });

  it("never throws on a bad date; treats it as just-placed", () => {
    expect(fulfillmentSla("not-a-date", "normal", NOW).state).toBe("within");
  });
});
