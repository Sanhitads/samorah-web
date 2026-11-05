import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import type { Capability } from "@/lib/auth/capabilities";
import type { StaffActor } from "@/services/manufacturing/actor";
import { ForbiddenError } from "@/services/manufacturing/actor";
import { listLabelTemplates, batchLabelPayload, generateLabel, labelPrintHistory, confirmLabelPrinted } from "@/services/manufacturing/labelService";

/**
 * POST /api/admin/labels — Phase 10 batch-label operations. manufacturing.operate (editor+); actor from the
 * authenticated session, never the body. A print records an append-only job and NEVER mutates QC/inventory/
 * lifecycle/recall state. Retail/product-batch label eligibility is enforced server-side in the RPC.
 */
export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (b: any, actor: StaffActor) => Promise<unknown>;
const CAP: Capability = "manufacturing.operate";
const ACTIONS: Record<string, Handler> = {
  templates: (b) => listLabelTemplates({ purpose: b.purpose }),
  payload:   (b) => batchLabelPayload(String(b.batchId), String(b.purpose)),
  generate:  (b, a) => generateLabel(a, { batchId: String(b.batchId), templateId: String(b.templateId), quantity: Number(b.quantity ?? 1) }),
  history:   (b) => labelPrintHistory(String(b.batchId)),
  confirm_printed: (b, a) => confirmLabelPrinted(a, String(b.jobId)),
};

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }
  const run = ACTIONS[body?.action];
  if (!run) return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  const staff = await requireCapability(CAP);
  if (!staff.ok || !staff.userId) return NextResponse.json({ ok: false, error: `Forbidden — needs the ${CAP} capability.` }, { status: 403 });
  try {
    const result = await run(body, { userId: staff.userId, role: staff.role ?? "" });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Request failed." }, { status: 400 });
  }
}
