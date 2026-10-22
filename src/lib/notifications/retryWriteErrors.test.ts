import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * FAILURE-SURFACING REGRESSION — supabase-js returns a DB failure in `{ error }` WITHOUT throwing, so a
 * delivery-path write that the database rejects (permission denied, constraint, transient) is invisible
 * unless the code reads `error`. These tests pin that:
 *   • a failed `claim_due_notifications` RPC is surfaced as `claimError` (a silent stall is reported as a
 *     HARD failure), not mistaken for a healthy "nothing was due" run;
 *   • a rejected lease-release / DLQ-transition / terminal status write is surfaced via `writeErrors`,
 *     and a rejected DLQ transition is NOT counted as `dead` (no false success);
 *   • `retryDispatch` does NOT report ok:true when the send went out but the status write was rejected.
 * The `updateError` / `claimError` injectors drive each case; a positive control proves the gate is not
 * vacuously failing.
 */
let claimError: any = null;          // eslint-disable-line @typescript-eslint/no-explicit-any
let updateError: any = null;         // eslint-disable-line @typescript-eslint/no-explicit-any
let claimedRows: any[] = [];         // eslint-disable-line @typescript-eslint/no-explicit-any
let seededRow: any = null;           // eslint-disable-line @typescript-eslint/no-explicit-any
let sendResult: any = { channel: "slack", status: "sent", target: "#ops" }; // eslint-disable-line @typescript-eslint/no-explicit-any
let slackConfigured = true;
const updateCalls: { patch: any; id: string }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

// A channel whose configured()/send() outcome we control, so attemptDispatch reaches its terminal write.
vi.mock("./channels/slack", () => ({
  slackChannel: { key: "slack", configured: () => slackConfigured, send: async () => sendResult },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    // `data` is returned even when claimError is set (decoupled on purpose) so the claim-failure test's
    // `updateCalls` assertion is NON-VACUOUS: if the early return on claimErr were removed, the loop would
    // iterate claimedRows and touch rows — the assertion would then fail, as it should.
    rpc: async (fn: string, _args: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
      fn === "claim_due_notifications" ? { data: claimedRows, error: claimError } : { data: null, error: null },
    from: (_table: string) => ({
      update: (patch: any) => ({ eq: async (_c: string, id: string) => { updateCalls.push({ patch, id }); return { data: null, error: updateError }; } }), // eslint-disable-line @typescript-eslint/no-explicit-any
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: "new" }, error: null }) }) }),
      select: (_cols?: string) => ({ eq: (_c: string, _id: string) => ({ maybeSingle: async () => ({ data: seededRow, error: null }) }) }),
    }),
  }),
}));

import { runRetryWorker, retryDispatch } from "./opsEngine";

const due = new Date(Date.now() - 60_000).toISOString();

describe("runRetryWorker — surfaces DB failures (no false success)", () => {
  beforeEach(() => { claimError = null; updateError = null; claimedRows = []; seededRow = null; sendResult = { channel: "slack", status: "sent", target: "#ops" }; slackConfigured = true; updateCalls.length = 0; });

  it("a failed claim_due_notifications RPC → claimError:true, aborts before processing (not a silent idle run)", async () => {
    claimError = { message: "permission denied for function claim_due_notifications", code: "42501" };
    claimedRows = [{ id: "x1", status: "failed", attempts: 1, channel: "slack", next_retry_at: due }];
    const res = await runRetryWorker();
    expect(res.claimError).toBe(true);
    expect(res).toMatchObject({ retried: 0, delivered: 0, dead: 0, writeErrors: 0 });
    expect(updateCalls).toHaveLength(0);   // aborted — no rows touched
  });

  it("a rejected DLQ-transition write → writeErrors incremented and NOT counted as dead", async () => {
    claimedRows = [{ id: "d1", status: "failed", attempts: 99, channel: "slack", next_retry_at: due, error: "boom" }];
    updateError = { message: "deadlock detected" };
    const res = await runRetryWorker();
    expect(res.dead).toBe(0);              // write failed → not a false "retired to DLQ"
    expect(res.writeErrors).toBe(1);
    expect(res.claimError).toBe(false);
  });

  it("a rejected lease-release write (skip path) → writeErrors incremented", async () => {
    claimedRows = [{ id: "w1", status: "failed", attempts: 1, channel: "in_app", next_retry_at: due }]; // in_app not auto-retried → 'wait'
    updateError = { message: "connection reset" };
    const res = await runRetryWorker();
    expect(res.writeErrors).toBe(1);
    expect(res).toMatchObject({ retried: 0, delivered: 0, dead: 0 });
  });

  it("send succeeds but the terminal status write is rejected → delivered counted, writeErrors flags the lost persist", async () => {
    claimedRows = [{ id: "s1", status: "failed", attempts: 1, channel: "slack", next_retry_at: due, error: null }];
    sendResult = { channel: "slack", status: "sent", target: "#ops" };
    updateError = { message: "could not serialize access" };
    const res = await runRetryWorker();
    expect(res.retried).toBe(1);
    expect(res.delivered).toBe(1);         // the dispatch genuinely went out
    expect(res.writeErrors).toBe(1);       // …but its state did not persist — surfaced, not hidden
  });

  it("positive control: clean run surfaces no errors", async () => {
    claimedRows = [{ id: "ok1", status: "failed", attempts: 1, channel: "slack", next_retry_at: due }];
    const res = await runRetryWorker();
    expect(res).toMatchObject({ retried: 1, delivered: 1, dead: 0, claimError: false, writeErrors: 0 });
  });

  it("an unconfigured auto-retry channel is a FAILED attempt that releases the lease (no 15-min stuck spin)", async () => {
    // Channel is in autoRetryChannels (so retryDecision → 'retry') but lost its creds at runtime.
    slackConfigured = false;
    claimedRows = [{ id: "u1", status: "failed", attempts: 1, channel: "slack", next_retry_at: due, retry_history: [] }];
    const res = await runRetryWorker();
    const terminal = updateCalls.find((c) => c.id === "u1" && ("next_retry_at" in c.patch || c.patch.status === "dead"));
    expect(terminal, "a terminal write must persist (lease released, attempts advanced)").toBeTruthy();
    expect(terminal!.patch.claimed_at).toBeNull();      // lease RELEASED — not stranded for 15m
    expect(terminal!.patch.attempts).toBe(2);           // advanced → progresses toward the DLQ
    expect(res.delivered).toBe(0);
  });
});

describe("retryDispatch — no false success when the status write is rejected", () => {
  beforeEach(() => { claimError = null; updateError = null; claimedRows = []; seededRow = null; sendResult = { channel: "slack", status: "sent", target: "#ops" }; slackConfigured = true; updateCalls.length = 0; });

  it("send delivered but terminal write rejected → ok:false with a 'not persisted' reason", async () => {
    seededRow = { id: "r1", status: "failed", attempts: 1, channel: "slack", next_retry_at: due, retry_history: [] };
    updateError = { message: "could not serialize access" };
    const r = await retryDispatch("r1", "tester");
    expect(r.ok).toBe(false);              // was a false ok:true before the error check
    expect(r.status).toBe("delivered");    // the send itself did happen
    expect(r.error).toMatch(/not persisted/);
  });

  it("positive control: delivered + persisted → ok:true", async () => {
    seededRow = { id: "r2", status: "failed", attempts: 1, channel: "slack", next_retry_at: due, retry_history: [] };
    const r = await retryDispatch("r2", "tester");
    expect(r.ok).toBe(true);
    expect(r.status).toBe("delivered");
  });
});
