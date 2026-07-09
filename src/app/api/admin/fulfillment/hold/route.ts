import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { holdFulfillment, resumeFulfillment } from "@/services/fulfillmentService";

/** POST /api/admin/fulfillment/hold { orderNumber, reason? } — staff-gated.
 *  With { resume: true } it resumes to the exact prior state instead. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { orderNumber?: string; reason?: string; resume?: boolean };
  try {
    body = (await request.json()) as { orderNumber?: string; reason?: string; resume?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.orderNumber) return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });

  try {
    const result = body.resume
      ? await resumeFulfillment(body.orderNumber)
      : await holdFulfillment(body.orderNumber, body.reason);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
