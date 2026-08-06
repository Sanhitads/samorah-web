import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { receiveReturnGoods, type ReceiveLine } from "@/services/returnReceivingService";

/**
 * POST /api/admin/returns/receive { returnId, note?, lines: [{ variantId, received, restockable, damaged }] }
 * Records + commits ONE physical receipt for a return. Physical-receiving is an operational action →
 * returns.operate (never inventory.adjust). Collects physical facts only; the DB CHECKs + commit_receipt
 * remain authoritative. Never accepts raw stock deltas.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { returnId?: string; note?: string; lines?: ReceiveLine[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { returnId, note, lines } = body;
  if (!returnId || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "returnId and at least one receipt line are required." }, { status: 400 });
  }

  const staff = await requireCapability("returns.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the returns.operate capability." }, { status: 403 });

  try {
    const result = await receiveReturnGoods(returnId, lines, { note, actorId: staff.userId ?? undefined });
    if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not record receipt." }, { status: 422 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
