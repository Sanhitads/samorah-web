import { describe, it, expect } from "vitest";
import { mapProviderStatus } from "@/lib/shipping/statusMap";
import { buildDeliveryEmail } from "@/lib/email";

describe("mapProviderStatus — raw courier status → unified", () => {
  it("normalizes spacing/casing/hyphens", () => {
    expect(mapProviderStatus("shiprocket", "In Transit")).toBe("in_transit");
    expect(mapProviderStatus("delhivery", "OUT-FOR-DELIVERY")).toBe("out_for_delivery");
    expect(mapProviderStatus("bluedart", "Delivered")).toBe("delivered");
  });
  it("maps NDR/undelivered/lost/damaged to exception", () => {
    for (const s of ["NDR", "undelivered", "failed", "lost", "damaged"]) {
      expect(mapProviderStatus("manual", s)).toBe("exception");
    }
  });
  it("maps returned/RTO variants to rto", () => {
    expect(mapProviderStatus("manual", "RTO")).toBe("rto");
    expect(mapProviderStatus("manual", "rto_delivered")).toBe("rto");
    expect(mapProviderStatus("manual", "returned")).toBe("rto");
  });
  it("returns null for unknown statuses (webhook acks + ignores)", () => {
    expect(mapProviderStatus("manual", "some_new_status")).toBeNull();
  });
});

describe("ORDER_DELIVERED email", () => {
  it("renders arrival + optional recipient, never localhost", () => {
    const { subject, html, text } = buildDeliveryEmail({
      order_number: "SAM-2026-000007",
      ship_full_name: "Sanhita Das",
      email: "x@y.com",
      delivered_to: "security",
    });
    expect(subject).toContain("has arrived");
    expect(html).toContain("received by security");
    expect(html).not.toContain("localhost");
    expect(text).not.toContain("<td");
  });
});
