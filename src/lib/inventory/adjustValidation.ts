import type { AdjustMode } from "@/lib/inventory/adjustLogic";

/**
 * Server-side validation for manual inventory adjustments (Phase 1A §3). Enforced in the API route —
 * never trusting the UI. The reason is whitelisted to the canonical MANUAL set, which by construction
 * REJECTS system/return reasons (return_restock / rto_restock / sale / cancel_restock / opening_balance):
 * those movements are produced only by their canonical workflows, never by a manual adjustment.
 */
export const MANUAL_REASONS = [
  "Stock received", "Physical count correction", "Damaged", "Lost",
  "Sample or internal use", "Promotional giveaway", "Other",
] as const;
export type ManualReason = (typeof MANUAL_REASONS)[number];

const REASON_SET = new Set<string>(MANUAL_REASONS);
export const MAX_REFERENCE = 120;
export const MAX_NOTE = 500;
export const MIN_OTHER_NOTE = 3;

export interface CleanAdjust { mode: AdjustMode; qty: number; reason: ManualReason; note?: string; reference?: string }

export function validateAdjustInput(input: { mode?: string; qty?: unknown; reason?: string; note?: string; reference?: string }):
  | { ok: true; clean: CleanAdjust }
  | { ok: false; reason: string } {
  if (input.mode !== "add" && input.mode !== "remove" && input.mode !== "set") return { ok: false, reason: "invalid mode" };
  const qty = Number(input.qty);
  if (!Number.isInteger(qty) || qty < 0) return { ok: false, reason: "quantity must be a non-negative integer" };
  const reason = (input.reason ?? "").trim();
  if (!REASON_SET.has(reason)) return { ok: false, reason: "reason must be one of the allowed manual reasons" };
  const note = (input.note ?? "").trim();
  const reference = (input.reference ?? "").trim();
  if (reason === "Other" && note.length < MIN_OTHER_NOTE) return { ok: false, reason: "a note is required when the reason is Other" };
  if (reference.length > MAX_REFERENCE) return { ok: false, reason: `reference must be ≤ ${MAX_REFERENCE} characters` };
  if (note.length > MAX_NOTE) return { ok: false, reason: `note must be ≤ ${MAX_NOTE} characters` };
  return { ok: true, clean: { mode: input.mode, qty, reason: reason as ManualReason, note: note || undefined, reference: reference || undefined } };
}
