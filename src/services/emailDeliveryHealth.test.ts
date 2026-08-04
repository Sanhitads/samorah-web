import { describe, it, expect } from "vitest";
import { deriveHealth, maskRecipient, redactSecrets, toDeliveryRow, DELIVERY_ROW_FIELDS } from "./emailDeliveryService";

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

describe("redactSecrets — no credential can leak through the error field", () => {
  it("redacts bearer tokens, provider keys, and auth/secret assignments", () => {
    expect(redactSecrets("Authorization: Bearer abc.def-123")).not.toMatch(/abc\.def-123/);
    expect(redactSecrets("resend 401: key re_1234567890abcd invalid")).toContain("[redacted-key]");
    expect(redactSecrets("x-api-key=sk_live_9f8e7d6c5b4a")).not.toMatch(/sk_live_9f8e7d6c5b4a/);
    expect(redactSecrets('{"api_key":"topsecretvalue"}')).not.toContain("topsecretvalue");
  });
  it("leaves benign provider errors and null intact", () => {
    expect(redactSecrets("resend 422: recipient bounced")).toBe("resend 422: recipient bounced");
    expect(redactSecrets(null)).toBeNull();
  });
});

describe("toDeliveryRow — explicit safe allowlist + masking + redaction", () => {
  const raw = {
    id: "d1", status: "failed", recipient: "aarohi@example.com",
    error: "resend 401: Bearer sk_live_deadbeef1234 rejected",
    provider_message_id: "msg_abc", created_at: "2026-08-04T10:00:00Z",
    order_id: "o-uuid", entity_ref: "ret-9",
    // hostile extra columns that must NOT survive the mapping:
    payload: { authorization: "Bearer secret" }, api_key: "sk_live_leak", raw_response: "…",
  };
  const row = toDeliveryRow(raw, "SAM1042");

  it("exposes exactly the allowlisted fields — no payload/credentials/unknown columns", () => {
    const bag = row as unknown as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual([...DELIVERY_ROW_FIELDS].sort());
    expect(bag).not.toHaveProperty("payload");
    expect(bag).not.toHaveProperty("api_key");
    expect(bag).not.toHaveProperty("raw_response");
  });
  it("masks the recipient and redacts secrets in the error", () => {
    expect(row.recipient).toBe("a***@example.com");
    expect(row.error).not.toMatch(/sk_live_deadbeef1234/);
    expect(JSON.stringify(row)).not.toMatch(/sk_live|secret|Bearer sk/);
  });
  it("keeps orderNumber null when there is no stored order_id (never fabricated)", () => {
    expect(toDeliveryRow({ ...raw, order_id: null }, "SAM1042").orderNumber).toBeNull();
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
