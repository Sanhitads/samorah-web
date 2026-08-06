import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { closeReturnReceiving } from "@/services/returnReceivingService";

/**
 * POST /api/admin/returns/receiving/close { returnId } — the authoritative receiving-closure boundary.
 * Operational action → returns.operate. The DB (close_return_receiving) enforces the real invariants:
 * valid receiving state, zero open drafts, idempotent second close, and the return-row lock that
 * serialises against concurrent receipt commits.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { returnId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { returnId } = body;
  if (!returnId) return NextResponse.json({ error: "returnId is required." }, { status: 400 });

  const staff = await requireCapability("returns.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the returns.operate capability." }, { status: 403 });

  try {
    const result = await closeReturnReceiving(returnId, { actorId: staff.userId ?? undefined });
    if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not close receiving." }, { status: 422 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
