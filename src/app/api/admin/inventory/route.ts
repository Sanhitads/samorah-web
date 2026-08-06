import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { listInventory, inventorySummary, listUntrackedPhysical, getMovements, adjustInventory } from "@/services/inventoryService";
import { validateAdjustInput } from "@/lib/inventory/adjustValidation";

/**
 * POST /api/admin/inventory — inventory operations.
 * RBAC (server-authoritative): reads need inventory.view (manager+); `adjust` needs inventory.adjust
 * (admin+). A manager can read stock/history but every adjust attempt is refused here, not just hidden.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  if (body.action === "adjust") {
    const staff = await requireCapability("inventory.adjust");
    if (!staff.ok) return NextResponse.json({ error: "Forbidden — needs the inventory.adjust capability." }, { status: 403 });
    if (!body.variantId) return NextResponse.json({ ok: false, reason: "variant is required" }, { status: 400 });
    if (!body.idempotencyKey) return NextResponse.json({ ok: false, reason: "missing idempotency key" }, { status: 400 });
    // Server-authoritative validation — canonical reason whitelist (rejects Return/RTO/system reasons),
    // Other-requires-note, trimmed/bounded reference & note. The UI is not trusted.
    const v = validateAdjustInput({ mode: body.mode, qty: body.qty, reason: body.reason, note: body.note, reference: body.reference });
    if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });
    const res = await adjustInventory({
      variantId: String(body.variantId), mode: v.clean.mode, qty: v.clean.qty, reason: v.clean.reason,
      note: v.clean.note, reference: v.clean.reference,
      actorId: staff.userId ?? undefined, idempotencyKey: String(body.idempotencyKey),
    });
    return NextResponse.json(res);
  }

  // Read actions — inventory.view (manager+).
  const staff = await requireCapability("inventory.view");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — needs the inventory.view capability." }, { status: 403 });

  if (body.action === "movements") {
    return NextResponse.json({ ok: true, movements: await getMovements(String(body.variantId), 200) });
  }
  if (body.action === "list") {
    const rows = await listInventory();
    const untracked = listUntrackedPhysical();
    return NextResponse.json({ ok: true, rows, summary: inventorySummary(rows, untracked.length), untracked });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
