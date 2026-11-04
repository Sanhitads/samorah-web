/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Quality Control (Phase 4) — versioned templates, routine batch QC, and distinct
 * product-design burn validation. NON-STOCK. Routine QC reconciles batch quantities
 * (pending → approved/rejected/sampled) atomically in the record_qc RPC; QC history is
 * append-only. Design validation is config-fingerprinted so a CHANGED configuration is
 * never auto-validated by an unrelated prior test.
 */
import { callRpc } from "@/lib/supabase/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { hasCapability } from "@/lib/auth/capabilities";
import { assertCap, type StaffActor } from "@/services/manufacturing/actor";

const db = () => createAdminClient();

export interface QcTemplateInput { productType: string; variantConfig?: string; name?: string; requiredChecks: unknown; active?: boolean }
export interface RoutineQcInput {
  batchId: string; templateId?: string; sampleSize?: number;
  inspectedQty: number; approvedDelta: number; rejectedDelta: number; sampledDestroyedDelta?: number;
  result: "pass" | "fail" | "conditional"; measurements: Record<string, unknown>;
  criteria?: unknown; deviations?: string; approvalNotes?: string; idempotencyKey?: string;
  /** A reason to pass despite a failed MANDATORY (non-critical) check. Honoured only when
   *  the actor also holds manufacturing.qc_approve; CRITICAL failures can never be bypassed. */
  exceptionReason?: string;
}
export interface DesignValidationInput {
  batchId: string; sampleSize?: number; sampledDestroyedQty?: number;
  result: "pass" | "fail" | "conditional"; measurements: Record<string, unknown>;
  criteria?: unknown; deviations?: string; idempotencyKey?: string;
}

export async function upsertTemplate(actor: StaffActor, input: QcTemplateInput): Promise<{ templateId: string; version: number }> {
  assertCap(actor, "manufacturing.qc");
  const res = await callRpc<any>("upsert_qc_template", {
    p: { product_type: input.productType, variant_config: input.variantConfig ?? "", name: input.name ?? "", required_checks: input.requiredChecks ?? [], active: input.active ?? true },
  });
  return { templateId: res.template_id, version: res.version };
}

export async function listTemplates(productType?: string): Promise<any[]> {
  let q = db().from("qc_templates").select("*").order("product_type").order("version", { ascending: false });
  if (productType) q = q.eq("product_type", productType);
  const { data } = await q;
  return data ?? [];
}

export async function recordRoutineQc(actor: StaffActor, input: RoutineQcInput): Promise<{ qcId: string; idempotent: boolean }> {
  assertCap(actor, "manufacturing.qc");
  // A mandatory-check exception is only honoured for a QC-approver; critical failures ignore it entirely (DB-enforced).
  const allowException = !!input.exceptionReason && hasCapability(actor.role, "manufacturing.qc_approve");
  const res = await callRpc<any>("record_qc", {
    p: {
      batch_id: input.batchId, template_id: input.templateId ?? "", sample_size: input.sampleSize ?? 0,
      inspected_qty: input.inspectedQty, approved_delta: input.approvedDelta, rejected_delta: input.rejectedDelta,
      sampled_destroyed_delta: input.sampledDestroyedDelta ?? 0, result: input.result,
      measurements: input.measurements ?? {}, criteria: input.criteria ?? null,
      deviations: input.deviations ?? "", approval_notes: input.approvalNotes ?? "", idempotency_key: input.idempotencyKey ?? "",
      allow_exception: allowException, exception_reason: input.exceptionReason ?? "", actor_id: actor.userId,
    },
  });
  if (!res.idempotent) await logEvent({ entityType: "batch", entityId: input.batchId, event: "batch.qc_recorded", actorType: "staff", actorId: actor.userId, notes: input.result, metadata: input.exceptionReason ? { exception: input.exceptionReason } : undefined });
  return { qcId: res.qc_id, idempotent: !!res.idempotent };
}

export async function recordDesignValidation(actor: StaffActor, input: DesignValidationInput): Promise<{ validationId: string; configFingerprint: string; idempotent: boolean }> {
  assertCap(actor, "manufacturing.qc");
  const res = await callRpc<any>("record_design_validation", {
    p: {
      batch_id: input.batchId, sample_size: input.sampleSize ?? 0, sampled_destroyed_qty: input.sampledDestroyedQty ?? 0,
      result: input.result, measurements: input.measurements ?? {}, criteria: input.criteria ?? null,
      deviations: input.deviations ?? "", idempotency_key: input.idempotencyKey ?? "", actor_id: actor.userId,
    },
  });
  if (!res.idempotent) await logEvent({ entityType: "batch", entityId: input.batchId, event: "batch.design_validated", actorType: "staff", actorId: actor.userId, notes: input.result });
  return { validationId: res.validation_id, configFingerprint: res.config_fingerprint, idempotent: !!res.idempotent };
}

/** Revoke a design validation so it no longer qualifies any batch for release. */
export async function revokeDesignValidation(actor: StaffActor, validationId: string, reason: string): Promise<void> {
  assertCap(actor, "manufacturing.qc_approve");
  await callRpc<any>("revoke_design_validation", { p: { validation_id: validationId, reason, actor_id: actor.userId } });
  await logEvent({ entityType: "batch", event: "batch.design_validation_revoked", actorType: "staff", actorId: actor.userId, entityId: validationId, notes: reason });
}

export async function listQcForBatch(batchId: string): Promise<any[]> {
  const { data } = await db().from("batch_quality_checks").select("*").eq("batch_id", batchId).order("performed_at", { ascending: true });
  return data ?? [];
}

export async function listDesignValidations(batchId: string): Promise<any[]> {
  const { data } = await db().from("batch_design_validations").select("*").eq("batch_id", batchId).order("validated_at", { ascending: false });
  return data ?? [];
}

/** Does this batch's CURRENT configuration have an APPROVED (not superseded/revoked)
 *  passing design validation? A config change (new wick/formula/fill…) changes the
 *  fingerprint, so a prior unrelated or revoked test does not count. */
export async function designValidationStatus(batchId: string): Promise<{ validated: boolean; fingerprint: string }> {
  const fingerprint = await callRpc<string>("batch_config_fingerprint", { p_batch_id: batchId });
  const { data } = await db().from("batch_design_validations").select("id")
    .eq("config_fingerprint", fingerprint).eq("result", "pass").eq("state", "approved").limit(1);
  return { validated: (data?.length ?? 0) > 0, fingerprint };
}
