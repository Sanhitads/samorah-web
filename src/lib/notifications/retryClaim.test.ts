import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CONCURRENCY REGRESSION — the notification auto-retry worker must obtain its work via the ATOMIC
 * claim RPC (claim_due_notifications, which uses FOR UPDATE SKIP LOCKED), never via a plain SELECT.
 * That is what stops two overlapping runs of the every-5-minute cron from dispatching the same
 * notification twice.
 *
 * The `from(...).select` stub THROWS, so if the worker ever reverts to the old unguarded
 * select-then-loop path this test fails. We also assert the lease (`claimed_at`) is released on the
 * terminal/skip paths so the real backoff governs the next attempt.
 */
let claimedRows: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
const rpcCalls: { fn: string; args: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
const updateCalls: { patch: any; id: string }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      rpcCalls.push({ fn, args });
      return { data: fn === "claim_due_notifications" ? claimedRows : null, error: null };
    },
    from: (table: string) => ({
      update: (patch: any) => ({ eq: async (_col: string, id: string) => { updateCalls.push({ patch, id }); return { data: null, error: null }; } }), // eslint-disable-line @typescript-eslint/no-explicit-any
      // Any direct SELECT in the worker is the unsafe (double-send-prone) pattern — forbid it.
      select: () => { throw new Error(`retry worker must CLAIM via RPC, not SELECT ${table}`); },
    }),
  }),
}));

import { runRetryWorker } from "./opsEngine";

const due = new Date(Date.now() - 60_000).toISOString();

describe("runRetryWorker — atomic claim", () => {
  beforeEach(() => { claimedRows = []; rpcCalls.length = 0; updateCalls.length = 0; });

  it("obtains work ONLY through claim_due_notifications(p_limit) — never a direct SELECT", async () => {
    claimedRows = [{ id: "n1", status: "failed", attempts: 99, channel: "slack", next_retry_at: due, error: "500" }];
    const res = await runRetryWorker();
    expect(rpcCalls).toEqual([{ fn: "claim_due_notifications", args: { p_limit: 50 } }]);
    // An exhausted failure → DLQ. Reaching this proves the claimed row was actually processed.
    expect(res.dead).toBe(1);
  });

  it("retires an exhausted failure to the DLQ AND releases its lease (claimed_at = null)", async () => {
    claimedRows = [{ id: "n1", status: "failed", attempts: 99, channel: "slack", next_retry_at: due, error: "boom" }];
    await runRetryWorker();
    const dead = updateCalls.find((c) => c.patch.status === "dead");
    expect(dead).toBeTruthy();
    expect(dead!.id).toBe("n1");
    expect(dead!.patch.claimed_at).toBeNull();
  });

  it("releases the lease on a row it decides to skip (so the next run can re-claim it)", async () => {
    // in_app is not an auto-retried provider channel → retryDecision = 'wait' → lease released.
    claimedRows = [{ id: "n2", status: "failed", attempts: 1, channel: "in_app", next_retry_at: due, error: null }];
    await runRetryWorker();
    const release = updateCalls.find((c) => c.id === "n2");
    expect(release).toBeTruthy();
    expect(release!.patch).toEqual({ claimed_at: null });
  });

  it("an empty claim does no work but still goes through the claim RPC exactly once", async () => {
    claimedRows = [];
    const res = await runRetryWorker();
    expect(rpcCalls).toHaveLength(1);
    expect(res).toEqual({ retried: 0, delivered: 0, dead: 0, claimError: false, writeErrors: 0 });
  });
});
