import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { updateReturnRecord, type ReturnUpdate } from "@/services/returnService";

/**
 * POST /api/admin/returns/update { returnId, ...fields } — set Resolution-Center fields on a return.
 * Capability follows the field: resolution / refund method / customer message are financial-facing
 * decisions → returns.approve; inspection / warehouse decision / damage / internal note are
 * operational → returns.operate. Mirrors the cancel-vs-refund split.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { returnId?: string } & ReturnUpdate;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.returnId) return NextResponse.json({ error: "returnId is required." }, { status: 400 });

  // A change that decides money / speaks to the customer needs the approve capability.
  const financial = body.resolution !== undefined || body.resolutionReason !== undefined || body.refundMethod !== undefined || body.customerMessage !== undefined;
  const cap = financial ? "returns.approve" : "returns.operate";
  const staff = await requireCapability(cap);
  if (!staff.ok) return NextResponse.json({ error: `Forbidden — this change needs the ${cap} capability.` }, { status: 403 });

  const { returnId, ...update } = body;
  const result = await updateReturnRecord(returnId, update, staff.userId ?? undefined);
  if (!result.ok) return NextResponse.json({ error: result.reason ?? "Failed." }, { status: 422 });
  return NextResponse.json(result);
}
