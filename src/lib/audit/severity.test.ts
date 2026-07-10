import { describe, it, expect } from "vitest";
import { eventSeverity } from "@/lib/audit/severity";

describe("eventSeverity", () => {
  it("created/requested/activated → created (blue)", () => {
    expect(eventSeverity("product.created")).toBe("created");
    expect(eventSeverity("return.requested")).toBe("created");
    expect(eventSeverity("coupon.activated")).toBe("created");
  });
  it("cancelled/failed/refunded/rto → deleted (red)", () => {
    expect(eventSeverity("order.cancelled")).toBe("deleted");
    expect(eventSeverity("refund.failed")).toBe("deleted");
    expect(eventSeverity("shipment.rto")).toBe("deleted");
  });
  it("on_hold/exception/deactivated → warning (yellow)", () => {
    expect(eventSeverity("fulfillment.on_hold")).toBe("warning");
    expect(eventSeverity("shipment.exception")).toBe("warning");
    expect(eventSeverity("rule.deactivated")).toBe("warning");
  });
  it("everything else → updated (green)", () => {
    expect(eventSeverity("fulfillment.picked")).toBe("updated");
    expect(eventSeverity("order.tagged")).toBe("updated");
    expect(eventSeverity("shipment.delivered")).toBe("updated");
  });
});
