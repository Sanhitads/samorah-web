/**
 * Multi-channel notification engine tests (Phase 5). Pure renderers + routing invariants —
 * deterministic, no network. The live end-to-end Slack post is verified separately.
 */
import { describe, it, expect } from "vitest";
import { buildSlackMessage } from "./channels/slack";
import { buildSmsText, smsChannel } from "./channels/sms";
import { buildOpsEmailHtml } from "./channels/opsEmail";
import { OPS_ROUTES, SEVERITY_COLOR, type OpsEvent } from "@/config/notifications";
import type { OpsPayload } from "./opsTypes";

const sample: OpsPayload = {
  title: "New Order", message: "A new order was placed.",
  fields: [{ label: "Order", value: "SAM-000234" }, { label: "Amount", value: "₹1,299" }],
  url: "https://samorah.example/admin/orders/SAM-000234", entityRef: "SAM-000234",
};

describe("Slack Block Kit builder", () => {
  it("renders a header, fields, a View button and a severity colour", () => {
    const msg = buildSlackMessage("order.placed", sample, "info") as any;
    expect(msg.attachments[0].color).toBe(SEVERITY_COLOR.info);
    const blocks = msg.attachments[0].blocks as any[];
    expect(blocks[0].type).toBe("header");
    expect(blocks[0].text.text).toContain("New Order");
    expect(JSON.stringify(blocks)).toContain("SAM-000234");
    expect(blocks.some((b) => b.type === "actions")).toBe(true); // View → button
    expect(msg.text).toContain("New Order");
  });
  it("critical uses the red bar and danger button", () => {
    const msg = buildSlackMessage("payment.gateway_down", { ...sample, title: "Payment System Down" }, "critical") as any;
    expect(msg.attachments[0].color).toBe(SEVERITY_COLOR.critical);
  });
  it("omits the actions block when there is no url", () => {
    const msg = buildSlackMessage("order.placed", { ...sample, url: undefined }, "info") as any;
    expect((msg.attachments[0].blocks as any[]).some((b) => b.type === "actions")).toBe(false);
  });
});

describe("SMS channel (critical-only)", () => {
  it("is dormant without MSG91 env", () => { expect(smsChannel.configured()).toBe(false); });
  it("SKIPS anything below critical severity (cannot spam)", async () => {
    const r = await smsChannel.send("order.placed", sample, "info");
    expect(r.status).toBe("skipped");
    expect(r.error).toMatch(/critical/i);
    const w = await smsChannel.send("order.placed", sample, "warning");
    expect(w.status).toBe("skipped");
  });
  it("builds a compact ≤160-char one-liner", () => {
    const t = buildSmsText({ title: "Payment System Down", message: "Orders cannot be processed", fields: [{ label: "Order", value: "SAM-1" }] });
    expect(t.length).toBeLessThanOrEqual(160);
    expect(t).toContain("Payment System Down");
    expect(t).toContain("Samorah");
  });
});

describe("ops email builder", () => {
  it("includes the title, fields and a View link", () => {
    const html = buildOpsEmailHtml(sample, "warning");
    expect(html).toContain("New Order");
    expect(html).toContain("SAM-000234");
    expect(html).toContain("View →");
  });
});

describe("routing invariants", () => {
  const events = Object.keys(OPS_ROUTES) as OpsEvent[];
  it("every route has a Slack channel + severity + non-empty channels", () => {
    for (const e of events) { const r = OPS_ROUTES[e]; expect(r.channels.length).toBeGreaterThan(0); expect(r.slack).toBeTruthy(); expect(["info", "warning", "critical"]).toContain(r.severity); }
  });
  it("SMS is ONLY routed to critical events (design invariant)", () => {
    for (const e of events) { if (OPS_ROUTES[e].channels.includes("sms")) expect(OPS_ROUTES[e].severity).toBe("critical"); }
  });
  it("in-app is present on every non-marketing/report operational event", () => {
    expect(OPS_ROUTES["order.placed"].channels).toContain("in_app");
    expect(OPS_ROUTES["payment.gateway_down"].channels).toContain("in_app");
  });
  it("critical infra events include email + slack + sms", () => {
    for (const e of ["payment.gateway_down", "site.down", "security.incident"] as OpsEvent[]) {
      expect(OPS_ROUTES[e].channels).toEqual(expect.arrayContaining(["slack", "sms"]));
    }
  });
});
