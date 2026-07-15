import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { notifyOps } from "@/lib/notifications/opsEngine";
import type { OpsChannelKey, SlackChannelKey } from "@/config/notifications";

/**
 * POST /api/admin/notifications/test — fire a sample operational notification so staff can verify a
 * channel end-to-end (e.g. confirm the Slack webhook posts to #samorah-ops). Staff-gated. Returns
 * per-channel results (sent / failed / skipped) so misconfiguration is visible immediately.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let b: { channels?: OpsChannelKey[]; slackChannel?: SlackChannelKey; severity?: "info" | "warning" | "critical" } = {};
  try { b = await request.json(); } catch { /* defaults */ }
  const channels = b.channels?.length ? b.channels : (["in_app", "slack"] as OpsChannelKey[]);

  const { results } = await notifyOps("order.placed", {
    title: "Test Notification",
    message: "This is a test from Samorah operations — if you can read this in Slack, the webhook works. ✅",
    severity: b.severity ?? "info",
    fields: [
      { label: "Triggered by", value: staff.userId ? "staff" : "system" },
      { label: "Channels", value: channels.join(", ") },
    ],
    slackChannel: b.slackChannel,
    entityType: "test", entityRef: "test",
  }, { channels });

  return NextResponse.json({ ok: true, results });
}
