import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { retryReturnRefund } from "@/services/returnService";

/**
 * POST /api/admin/returns/refund-retry { returnId } — re-issue a return refund whose previous
 * gateway attempt failed. Issuing money → returns.approve (same gate as the refund transition).
 * The service re-uses the refund ledger, which is over-refund-guarded, so this can't double-pay.
 */
export const runtime = "nodejs";

const FRIENDLY: Record<string, string> = {
  replacement_has_no_refund: "This is a replacement — there's no refund to retry.",
  no_refund_amount: "This return has no refund amount set.",
  already_refunded: "A refund is already linked to this return.",
  refund_not_failed: "The latest refund isn't in a failed state — nothing to retry.",
  return_not_found: "Return not found.",
};

export async function POST(request: Request) {
  const staff = await requireCapability("returns.approve");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — this action needs the returns.approve capability." }, { status: 403 });

  let body: { returnId?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body.returnId) return NextResponse.json({ error: "returnId is required." }, { status: 400 });

  const result = await retryReturnRefund(body.returnId, staff.userId ?? undefined);
  if (!result.ok) {
    const msg = (result.reason && FRIENDLY[result.reason]) || `Refund retry failed — ${result.reason ?? "gateway error"}.`;
    // 409 for "can't retry in this state"; 422 when the gateway rejected the money again.
    const conflict = result.reason ? result.reason in FRIENDLY : false;
    return NextResponse.json({ error: msg, ok: false }, { status: conflict ? 409 : 422 });
  }
  return NextResponse.json(result);
}
