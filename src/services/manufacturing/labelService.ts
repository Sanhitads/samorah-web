/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 10 — batch label generation & print history. INERT. A label print NEVER changes QC, inventory,
 * lifecycle or recall state — it records an append-only print job and returns the authoritative payload
 * (built from the immutable server-generated batch_code, never regenerated). Retail / product-batch labels
 * are refused server-side for a non-released or held/recalled batch. Capability-gated; actor server-derived.
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { assertCap, type StaffActor } from "@/services/manufacturing/actor";

const db = () => createAdminClient() as unknown as { from: (t: string) => any };

export async function listLabelTemplates(opts?: { purpose?: string }): Promise<any[]> {
  let q = db().from("label_templates").select("*").eq("active", true).order("template_key").order("version", { ascending: false });
  if (opts?.purpose) q = q.eq("purpose", opts.purpose);
  const { data } = await q;
  return data ?? [];
}

/** The authoritative label field set + legal-field completeness audit (verified / missing / optional). */
export async function batchLabelPayload(batchId: string, purpose: string): Promise<any> {
  return callRpc<any>("batch_label_payload", { p_batch_id: batchId, p_purpose: purpose });
}

export interface GenerateLabelInput { batchId: string; templateId: string; quantity?: number }

/** Validate eligibility + batch-code integrity, record the print job, and return the print payload. */
export async function generateLabel(actor: StaffActor, input: GenerateLabelInput): Promise<{ ok: boolean; batchCode?: string; encodedValue?: string; purpose?: string; payload?: any; quantity?: number }> {
  assertCap(actor, "manufacturing.operate");
  const r = await callRpc<any>("generate_label", { p: { batch_id: input.batchId, template_id: input.templateId, quantity: input.quantity ?? 1, actor_id: actor.userId } });
  await logEvent({ entityType: "batch", entityId: input.batchId, event: "label.generated", actorType: "staff", actorId: actor.userId, metadata: { purpose: r?.purpose, template_version: r?.template_version, quantity: r?.quantity, batch_code: r?.batch_code } });
  // encoded_value (for any barcode/QR) MUST equal the human-readable batch code.
  return { ok: !!r?.ok, batchCode: r?.batch_code, encodedValue: r?.encoded_value, purpose: r?.purpose, payload: r?.payload, quantity: r?.quantity };
}

/** Append-only print history for a batch (operator, template version, quantity, status, timestamp). */
export async function labelPrintHistory(batchId: string): Promise<any[]> {
  const { data } = await db().from("label_print_jobs").select("id,template_key,template_version,purpose,batch_code,quantity,status,printed_by,printed_confirmed_by,printed_confirmed_at,created_at").eq("batch_id", batchId).order("created_at", { ascending: false });
  return data ?? [];
}

/** Record that a GENERATED label job was physically printed (idempotent). Generation ≠ printing. */
export async function confirmLabelPrinted(actor: StaffActor, jobId: string): Promise<{ ok: boolean; status?: string }> {
  assertCap(actor, "manufacturing.operate");
  const r = await callRpc<any>("confirm_label_printed", { p: { job_id: jobId, actor_id: actor.userId } });
  await logEvent({ entityType: "settings", entityId: jobId, event: "label.print_confirmed", actorType: "staff", actorId: actor.userId });
  return { ok: !!r?.ok, status: r?.status ?? (r?.already_printed ? "printed" : undefined) };
}
