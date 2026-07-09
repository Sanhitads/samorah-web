import { describe, it, expect } from "vitest";
import { buildReturnEmail } from "@/lib/email";

const base = {
  order_number: "SAM-2026-000007",
  rma: "RMA-SAM-2026-000007",
  ship_full_name: "Sanhita Das",
  email: "guest@example.com",
  reason: "damaged",
  return_type: "refund",
  refund_amount: 1428,
};

describe("return lifecycle emails", () => {
  it("requested — acknowledges with RMA + order, no refund amount yet", () => {
    const { subject, html, text } = buildReturnEmail("return.requested", base);
    expect(subject).toContain("received your return RMA-SAM-2026-000007");
    expect(html).toContain("RMA-SAM-2026-000007");
    expect(html).toContain("Return Received");
    expect(html).not.toContain("₹1428.00"); // amount only on refunded
    expect(text).not.toContain("<td");
  });

  it("approved — states next steps", () => {
    const { subject, html } = buildReturnEmail("return.approved", base);
    expect(subject).toContain("is approved");
    expect(html).toMatch(/original packaging/);
  });

  it("rejected — points to support, no refund", () => {
    const { html } = buildReturnEmail("return.rejected", base);
    expect(html).toMatch(/weren't able to approve/);
    expect(html).not.toContain("₹1428.00");
  });

  it("refunded — shows the refund amount + timeline", () => {
    const { subject, html } = buildReturnEmail("return.refunded", base);
    expect(subject).toContain("is complete");
    expect(html).toContain("₹1428.00");
    expect(html).toMatch(/5–7 business days/);
    expect(html).not.toContain("localhost");
  });
});
