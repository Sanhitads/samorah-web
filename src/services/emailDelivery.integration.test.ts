import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 2 · Email delivery visibility — READ-ONLY smoke test against the real DB. It deliberately
 * NEVER writes to notification_dispatches (delivery-truth must not be polluted by tests). It proves the
 * canonical queries are schema-correct — the channel/event filters, the order_id→order_number FK
 * resolution, and the health scan — and that any returned recipient is masked. Env-gated.
 */
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* skip below */ }

const RUN = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const d = RUN ? describe : describe.skip;
let svc: typeof import("@/services/emailDeliveryService");
const EVENTS = ["order.confirmed", "order.dispatched", "order.cancelled", "delivery.completed", "return.requested", "return.approved", "return.refunded"];

beforeAll(async () => { if (RUN) svc = await import("@/services/emailDeliveryService"); });

d("email delivery visibility — canonical read paths (real DB, read-only)", () => {
  it("getEmailDeliveryHealth returns a well-formed entry for every managed event", async () => {
    const health = await svc.getEmailDeliveryHealth(EVENTS);
    expect(Object.keys(health).sort()).toEqual([...EVENTS].sort());
    for (const e of EVENTS) {
      const h = health[e];
      expect(["healthy", "degraded", "failing", "idle"]).toContain(h.status);
      expect(typeof h.sent24h).toBe("number");
      expect(typeof h.failed24h).toBe("number");
    }
  });

  it("listEmailDeliveries executes for each event and masks every recipient", async () => {
    for (const e of EVENTS) {
      const rows = await svc.listEmailDeliveries(e, 10);
      expect(Array.isArray(rows)).toBe(true);
      for (const r of rows) {
        // Masking invariant: a returned recipient never exposes the full local part.
        if (r.recipient.includes("@")) expect(r.recipient).toMatch(/^.\*\*\*@/);
        expect(["sent", "failed", "skipped"]).toContain(r.status);
        // order_number is either resolved from the stored FK or null — never fabricated.
        if (r.orderId === null) expect(r.orderNumber).toBeNull();
      }
    }
  });
});
