import { describe, it, expect } from "vitest";
import { deriveHealth, maskRecipient } from "./emailDeliveryService";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();
const EVENTS = ["order.confirmed", "order.dispatched", "return.refunded"];

describe("maskRecipient", () => {
  it("masks the local part but keeps the domain", () => {
    expect(maskRecipient("aarohi@example.com")).toBe("a***@example.com");
  });
  it("handles malformed / empty input safely", () => {
    expect(maskRecipient("notanemail")).toBe("•••");
    expect(maskRecipient("")).toBe("");
  });
});

describe("deriveHealth", () => {
  it("marks an event with no rows as idle", () => {
    const h = deriveHealth([], EVENTS, NOW);
    expect(h["order.confirmed"].status).toBe("idle");
    expect(h["order.confirmed"].lastSentAt).toBeNull();
    expect(h["order.confirmed"].sent24h).toBe(0);
  });

  it("healthy: recent sends, no failures in 24h", () => {
    const h = deriveHealth([
      { event: "order.confirmed", status: "sent", created_at: ago(2), error: null },
      { event: "order.confirmed", status: "sent", created_at: ago(60), error: null },
    ], EVENTS, NOW);
    expect(h["order.confirmed"].status).toBe("healthy");
    expect(h["order.confirmed"].sent24h).toBe(2);
    expect(h["order.confirmed"].failed24h).toBe(0);
    expect(h["order.confirmed"].lastSentAt).toBe(ago(2));
  });

  it("failing: the most recent attempt failed within 24h", () => {
    const h = deriveHealth([
      { event: "order.confirmed", status: "failed", created_at: ago(5), error: "bounce" },
      { event: "order.confirmed", status: "sent", created_at: ago(120), error: null },
    ], EVENTS, NOW);
    expect(h["order.confirmed"].status).toBe("failing");
    expect(h["order.confirmed"].failed24h).toBe(1);
    expect(h["order.confirmed"].lastError).toBe("bounce");
    expect(h["order.confirmed"].lastSentAt).toBe(ago(120)); // last success still tracked
  });

  it("degraded: a 24h failure but the latest attempt recovered", () => {
    const h = deriveHealth([
      { event: "order.confirmed", status: "sent", created_at: ago(3), error: null },
      { event: "order.confirmed", status: "failed", created_at: ago(90), error: "temporary" },
    ], EVENTS, NOW);
    expect(h["order.confirmed"].status).toBe("degraded");
    expect(h["order.confirmed"].failed24h).toBe(1);
  });

  it("failures older than 24h don't count toward 24h totals but still inform lastError", () => {
    const h = deriveHealth([
      { event: "order.confirmed", status: "sent", created_at: ago(30), error: null },
      { event: "order.confirmed", status: "failed", created_at: ago(48 * 60), error: "old" },
    ], EVENTS, NOW);
    expect(h["order.confirmed"].status).toBe("healthy"); // no failures in the last 24h
    expect(h["order.confirmed"].failed24h).toBe(0);
    expect(h["order.confirmed"].lastError).toBe("old"); // still surfaced from the scan window
  });

  it("ignores events it doesn't manage", () => {
    const h = deriveHealth([{ event: "some.other.event", status: "failed", created_at: ago(1), error: "x" }], EVENTS, NOW);
    expect(h["some.other.event"]).toBeUndefined();
    expect(Object.keys(h).sort()).toEqual([...EVENTS].sort());
  });
});
