import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { advanceReturn } from "@/services/returnService";
import { RETURN_STATUSES, type ReturnStatus } from "@/lib/returns/state";

/**
 * POST /api/admin/returns/advance { returnId, to } — move a return through its
 * state machine. FINANCIAL transitions (approve/reject/refund) need returns.approve;
 * operational ones (review/in-transit/received/inspection/replacement/closed) need
 * returns.operate. Mirrors the cancel-vs-refund split so warehouse can process but
 * not approve money.
 */
export const runtime = "nodejs";

const FINANCIAL = new Set<ReturnStatus>(["approved", "rejected", "refund_processing", "refunded"]);

export async function POST(request: Request) {
  let body: { returnId?: string; to?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { returnId, to } = body;
  if (!returnId || !to || !(RETURN_STATUSES as readonly string[]).includes(to)) {
    return NextResponse.json({ error: "returnId and a valid `to` status are required." }, { status: 400 });
  }

  const cap = FINANCIAL.has(to as ReturnStatus) ? "returns.approve" : "returns.operate";
  const staff = await requireCapability(cap);
  if (!staff.ok) return NextResponse.json({ error: `Forbidden — this transition needs the ${cap} capability.` }, { status: 403 });

  try {
    const result = await advanceReturn(returnId, to as ReturnStatus, { actorId: staff.userId ?? undefined });
    if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not advance return." }, { status: 422 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
