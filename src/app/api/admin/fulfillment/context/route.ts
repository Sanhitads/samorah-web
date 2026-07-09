import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { setPriority, assignOrder, setOpsTags, type BoardPriority } from "@/services/fulfillmentService";

/**
 * POST /api/admin/fulfillment/context — board triage metadata (SLP 11–13, 15):
 * priority, assignee, operational tags. Operational (not financial) → editor+.
 * Body: { orderNumber, priority?, assignToMe?, clearAssignee?, tags? }.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.triage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: {
    orderNumber?: string;
    priority?: BoardPriority;
    assignToMe?: boolean;
    clearAssignee?: boolean;
    tags?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.orderNumber) return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });

  try {
    const actorId = staff.userId ?? undefined;
    if (body.priority) await setPriority(body.orderNumber, body.priority, { actorId });
    if (body.assignToMe) await assignOrder(body.orderNumber, staff.userId, { actorId });
    if (body.clearAssignee) await assignOrder(body.orderNumber, null, { actorId });
    if (Array.isArray(body.tags)) await setOpsTags(body.orderNumber, body.tags, { actorId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
