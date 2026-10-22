import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Multi-recipient email delivery reliability. A partial failure must NOT mark the row delivered and
 * silently drop the failed recipients; it must stay retryable and, on retry, re-send ONLY the still-failed
 * recipients (never re-sending a success) — with a stable per-recipient idempotency key as a second line
 * of defence. These pin that contract at the channel level.
 */
const sendResults = new Map<string, { sent: boolean; reason?: string }>();
const sendCalls: { to: string; idempotencyKey?: string }[] = [];

vi.mock("@/lib/email", () => ({
  emailConfigured: () => true,
  sendEmail: async (m: { to: string; idempotencyKey?: string }) => {
    sendCalls.push({ to: m.to, idempotencyKey: m.idempotencyKey });
    return sendResults.get(m.to) ?? { sent: true };
  },
}));

import { opsEmailChannel } from "./channels/opsEmail";
import type { OpsPayload } from "./opsTypes";

const payload = (over: Partial<OpsPayload> = {}): OpsPayload =>
  ({ title: "T", emailTo: ["a@x.test", "b@x.test"], idempotencyKey: "nid", ...over });

describe("opsEmail — partial multi-recipient failure + retry recovery", () => {
  beforeEach(() => { sendResults.clear(); sendCalls.length = 0; });

  it("partial failure → status 'failed', only the SUCCEEDED recipient recorded as delivered", async () => {
    sendResults.set("b@x.test", { sent: false, reason: "550 mailbox" });
    const r = await opsEmailChannel.send("order.placed", payload(), "info");
    expect(r.status).toBe("failed");                       // stays retryable (was silently 'sent' before)
    expect(r.deliveredRecipients).toEqual(["a@x.test"]);
    expect(sendCalls.map((c) => c.to)).toEqual(["a@x.test", "b@x.test"]);
  });

  it("retry SKIPS the already-delivered recipient and re-sends ONLY the failed one → 'sent'", async () => {
    sendResults.set("b@x.test", { sent: true });           // provider recovered
    const r = await opsEmailChannel.send("order.placed", payload({ deliveredRecipients: ["a@x.test"] }), "info");
    expect(sendCalls.map((c) => c.to)).toEqual(["b@x.test"]);   // a@ NOT re-sent
    expect(r.status).toBe("sent");
    expect(new Set(r.deliveredRecipients)).toEqual(new Set(["a@x.test", "b@x.test"]));
  });

  it("uses a stable per-recipient idempotency key `<key>:<addr>` (de-dups a crash-after-accept resend)", async () => {
    await opsEmailChannel.send("order.placed", payload(), "info");
    expect(sendCalls.find((c) => c.to === "a@x.test")?.idempotencyKey).toBe("nid:a@x.test");
    expect(sendCalls.find((c) => c.to === "b@x.test")?.idempotencyKey).toBe("nid:b@x.test");
  });

  it("all recipients succeed → 'sent' with every recipient delivered", async () => {
    const r = await opsEmailChannel.send("order.placed", payload(), "info");
    expect(r.status).toBe("sent");
    expect(new Set(r.deliveredRecipients)).toEqual(new Set(["a@x.test", "b@x.test"]));
  });

  it("every recipient fails → 'failed', none delivered (fully retryable)", async () => {
    sendResults.set("a@x.test", { sent: false, reason: "x" });
    sendResults.set("b@x.test", { sent: false, reason: "y" });
    const r = await opsEmailChannel.send("order.placed", payload(), "info");
    expect(r.status).toBe("failed");
    expect(r.deliveredRecipients).toEqual([]);
  });

  it("a delivered recipient no longer in the recipient list is ignored (no stale skip)", async () => {
    const r = await opsEmailChannel.send("order.placed", payload({ deliveredRecipients: ["old@x.test"] }), "info");
    expect(sendCalls.map((c) => c.to).sort()).toEqual(["a@x.test", "b@x.test"]); // both sent; stale 'old@' ignored
    expect(r.status).toBe("sent");
  });
});
