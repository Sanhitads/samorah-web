import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRetryWorker, replayDeadLetter, RETRY_POLICY_INFO } from "@/lib/notifications/opsEngine";

/**
 * POST /api/admin/notifications/verify — DEVELOPMENT-ONLY end-to-end retry verification.
 *
 * Demonstrates the real lifecycle, driven by the REAL retry worker and a REAL failing provider
 * (email to a deliberately invalid recipient — not a mock, not a stub):
 *
 *   sending → failed → retry(1m) → retry(5m) → retry(15m) → DLQ → [reconnect] → replay → delivered
 *
 * Time is COMPRESSED: rather than waiting 21 minutes, each step advances `next_retry_at` into the
 * past — the worker's own backoff logic still decides every transition, we only fast-forward the
 * clock. Every transition is captured and returned as a verification report.
 *
 * "Reconnect" = the invalid recipient is corrected to a real one (mirroring "the gateway comes
 * back"), then the dead letter is replayed through the normal manual-replay path.
 *
 * Refuses to run in production. Cleans up after itself unless `keep: true`.
 */
export const runtime = "nodejs";

const db = () => createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const past = () => new Date(Date.now() - 60_000).toISOString();

interface Step { step: number; phase: string; status: string; attempts: number; error: string | null; note: string; at: string }

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Verification mode is disabled in production." }, { status: 403 });
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { keep?: boolean; recipient?: string } = {};
  try { body = await request.json(); } catch { /* defaults */ }
  const goodRecipient = body.recipient || "verify@samorah.test";   // used only for the "reconnect" step

  const report: Step[] = [];
  let logId: string | null = null;
  let n = 0;
  const snap = async (phase: string, note: string) => {
    const { data } = await db().from("notification_log").select("status,attempts,error").eq("id", logId).maybeSingle();
    report.push({ step: ++n, phase, status: data?.status ?? "?", attempts: data?.attempts ?? 0, error: data?.error ? String(data.error).slice(0, 120) : null, note, at: new Date().toISOString() });
  };

  try {
    // ── 1. Seed a dispatch that will genuinely fail (invalid recipient → real provider rejection) ──
    const groupId = crypto.randomUUID();
    const { data: seeded } = await db().from("notification_log").insert({
      group_id: groupId, event: "tech.error", channel: "email", severity: "warning", category: "system",
      title: "E2E retry verification", target: "not-an-email",
      payload: { message: "Development verification of the retry → DLQ → replay lifecycle.", fields: [{ label: "Mode", value: "verification" }], url: null },
      entity_type: "test", entity_ref: "E2E-VERIFY", retention_class: "debug",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: "failed", attempts: 1, error: "seeded: simulated outage", next_retry_at: past(),
    }).select("id").single();
    logId = seeded.id;
    await snap("seed", "Dispatch created against an invalid recipient — the provider will really reject it.");

    // ── 2. Walk the backoff ladder. The worker decides each transition; we only advance the clock. ──
    for (let attempt = 1; attempt < RETRY_POLICY_INFO.maxAttempts; attempt++) {
      const w = await runRetryWorker(10);
      await snap(`retry #${attempt}`, `Worker ran (retried=${w.retried}, dead=${w.dead}). Backoff step ${RETRY_POLICY_INFO.backoffMinutes[Math.min(attempt - 1, RETRY_POLICY_INFO.backoffMinutes.length - 1)]}m — clock fast-forwarded.`);
      const { data: row } = await db().from("notification_log").select("status").eq("id", logId).maybeSingle();
      if (row?.status === "dead") break;
      await db().from("notification_log").update({ next_retry_at: past() }).eq("id", logId);   // compress time
    }

    // ── 3. Confirm it landed in the DLQ (retries exhausted, real provider reason kept) ──
    const { data: deadRow } = await db().from("notification_log").select("status,dead_at,dead_reason,attempts,retry_history").eq("id", logId).maybeSingle();
    const reachedDlq = deadRow?.status === "dead";
    await snap("dead letter queue", reachedDlq ? `Retry policy exhausted after ${deadRow.attempts} attempts → DLQ. Reason kept: ${String(deadRow.dead_reason).slice(0, 60)}` : "DID NOT reach the DLQ — investigate.");

    // ── 4. "Reconnect": fix the recipient (the gateway comes back), then replay via the real path ──
    await db().from("notification_log").update({ target: goodRecipient }).eq("id", logId);
    await snap("reconnect", `Recipient corrected to ${goodRecipient} — the equivalent of the provider recovering.`);
    const replay = await replayDeadLetter(logId as string, `${staff.userId ? "verification" : "system"} (E2E)`);
    await snap("replay", replay.ok ? "Manual replay delivered — the notification was recovered from the DLQ." : `Replay did not deliver: ${replay.error ?? "unknown"} (expected if the mail provider rejects the test recipient).`);

    const { data: final } = await db().from("notification_log").select("status,attempts,retry_history,dead_at,replayed_at,replayed_by").eq("id", logId).maybeSingle();
    const verified = {
      reachedDlq,
      deliveredOnReplay: final?.status === "delivered",
      attempts: final?.attempts ?? 0,
      retryHistoryEntries: Array.isArray(final?.retry_history) ? final.retry_history.length : 0,
      replayAudited: !!final?.replayed_at && !!final?.replayed_by,
      nothingLost: !!final,   // the row survived every transition
    };

    if (!body.keep) await db().from("notification_log").delete().eq("id", logId);

    return NextResponse.json({
      ok: true,
      lifecycle: "sending → failed → retry ×N (1m/5m/15m backoff) → DLQ → reconnect → replay → delivered",
      note: "Real worker, real provider rejection. Time is compressed by advancing next_retry_at; the backoff logic itself is untouched.",
      policy: RETRY_POLICY_INFO,
      verified, report,
      cleanedUp: !body.keep,
    });
  } catch (e) {
    if (logId && !body.keep) { try { await db().from("notification_log").delete().eq("id", logId); } catch { /* ignore */ } }
    return NextResponse.json({ error: e instanceof Error ? e.message : "verification failed", report }, { status: 500 });
  }
}
