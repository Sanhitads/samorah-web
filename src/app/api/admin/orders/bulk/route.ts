import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import {
  applyBulkAction, resolveTargetsByNumbers, resolveTargetsByFilter,
  type OrderFilter, type BulkTarget,
} from "@/services/orderAdminService";
import { validateBulk, type BulkAction, type UndoRecord } from "@/lib/admin/orderBulk";

/**
 * POST /api/admin/orders/bulk — SAFE, non-destructive bulk operations (Phase 1).
 * Gated to fulfillment.triage (priority/assign/tags/notes). Deliberately does NOT support
 * cancel/refund/ship — those are destructive and live in the post-launch roadmap.
 *
 * Body: { action, orderNumbers?[] | allFiltered+filter, staffId?, priority?, tags?, note?, restore? }
 * Returns: { done, failed[], undo?, total } — a bad row is skipped, never fatal to the batch.
 */
export const runtime = "nodejs";

const SAFE_ACTIONS: BulkAction[] = ["assign", "priority", "addTags", "removeTags", "note", "restore"];

export async function POST(request: Request) {
  const staff = await requireCapability("fulfillment.triage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the fulfillment.triage capability." }, { status: 403 });

  let body: {
    action?: BulkAction;
    orderNumbers?: string[];
    allFiltered?: boolean;
    filter?: OrderFilter;
    staffId?: string;
    priority?: string;
    tags?: string[];
    note?: string;
    restore?: UndoRecord[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = body.action;
  if (!action || !SAFE_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unknown or unsafe bulk action." }, { status: 400 });
  }

  const valid = validateBulk({ action, staffId: body.staffId, priority: body.priority, tags: body.tags, note: body.note });
  if (!valid.ok) return NextResponse.json({ error: valid.reason }, { status: 400 });

  // Resolve the target set.
  let targets: BulkTarget[];
  if (action === "restore") {
    targets = await resolveTargetsByNumbers((body.restore ?? []).map((r) => r.orderNumber));
  } else if (body.allFiltered) {
    targets = await resolveTargetsByFilter(body.filter ?? {});
  } else {
    targets = await resolveTargetsByNumbers(body.orderNumbers ?? []);
  }
  if (!targets.length) return NextResponse.json({ error: "No orders selected." }, { status: 400 });

  const result = await applyBulkAction({
    action,
    targets,
    staffId: body.staffId,
    priority: body.priority,
    tags: body.tags,
    note: body.note,
    restore: body.restore,
    actorId: staff.userId ?? undefined,
  });

  return NextResponse.json({ ...result, total: targets.length });
}
