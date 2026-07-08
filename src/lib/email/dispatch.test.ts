import { describe, it, expect } from "vitest";
import { buildDispatchNotificationEmail } from "@/lib/email";

describe("ORDER_DISPATCHED email", () => {
  it("renders courier, AWB, and a canonical tracking link (never localhost)", () => {
    const { subject, html, text } = buildDispatchNotificationEmail({
      order_number: "SAM-2026-000009",
      ship_full_name: "Sanhita Das",
      email: "guest@example.com",
      courier_name: "Manual Dispatch",
      awb: "MANUAL-SAM-2026-000009",
    });
    expect(subject).toContain("has shipped");
    expect(html).toContain("Manual Dispatch");
    expect(html).toContain("MANUAL-SAM-2026-000009");
    expect(html).toContain("Track Shipment");
    expect(html).toMatch(/https:\/\/samorahstudio\.com\/order\/SAM-2026-000009\/track\?t=/);
    expect(html).not.toContain("localhost");
    // multipart plain-text alternative present + clean
    expect(text).toContain("On Its Way");
    expect(text).toContain("MANUAL-SAM-2026-000009");
    expect(text).not.toContain("<td");
  });
});
