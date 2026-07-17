/**
 * Safe bulk-operation logic (admin Phase 1) — pure, testable. NON-DESTRUCTIVE actions only:
 * assign, priority, add/remove tags, internal note. No cancel/refund/ship here (those are
 * deferred to the post-launch roadmap behind stronger guards).
 *
 * The engine that mutates lives in the service; this module owns the value math (tag merge/remove,
 * validation) and the undo descriptor shape, so the tricky parts are unit-tested rather than
 * discovered in production.
 */

export type BulkAction =
  | "assign" | "priority" | "addTags" | "removeTags" | "note"
  | "markFraud" | "markWholesale" | "linkIncident" // Phase 2 schema-backed flags
  | "restore";

/** Actions that change a stored column → reversible via a captured previous value. `note` writes an
 *  immutable audit event (no undo); `restore` IS the undo. */
export const REVERSIBLE: BulkAction[] = ["assign", "priority", "addTags", "removeTags", "markFraud", "markWholesale", "linkIncident"];

export const BULK_PRIORITIES = ["normal", "high", "urgent", "vip"] as const;
export const MAX_TAGS = 20;

/** Parse a comma/space list into clean, de-duped tags. */
export function parseTags(input: string): string[] {
  return [...new Set(input.split(/[,\n]/).map((t) => t.trim()).filter(Boolean))].slice(0, 12);
}

/** Union existing + added, capped — the result written to ops_tags. Order-stable. */
export function mergeTags(existing: string[], add: string[]): string[] {
  return [...new Set([...existing, ...add])].slice(0, MAX_TAGS);
}

/** Existing minus removed. */
export function removeTagsFrom(existing: string[], remove: string[]): string[] {
  const drop = new Set(remove);
  return existing.filter((t) => !drop.has(t));
}

export const FRAUD_VALUES = ["none", "pending_review", "under_investigation", "cleared", "confirmed_fraud"] as const;
export const WHOLESALE_VALUES = ["none", "wholesale_order", "b2b_customer"] as const;

export interface BulkValidateInput {
  action: BulkAction;
  staffId?: string;
  priority?: string;
  tags?: string[];
  note?: string;
  fraudState?: string;
  wholesaleState?: string;
  incidentNumber?: string;
}
/** Validate the params for an action before any DB work. Returns a reason when invalid. */
export function validateBulk(i: BulkValidateInput): { ok: true } | { ok: false; reason: string } {
  switch (i.action) {
    case "assign":
      return i.staffId ? { ok: true } : { ok: false, reason: "Pick a staff member to assign." };
    case "priority":
      return i.priority && (BULK_PRIORITIES as readonly string[]).includes(i.priority)
        ? { ok: true } : { ok: false, reason: "Pick a valid priority." };
    case "addTags":
    case "removeTags":
      return i.tags && i.tags.length ? { ok: true } : { ok: false, reason: "Enter at least one tag." };
    case "note":
      return i.note && i.note.trim().length ? { ok: true } : { ok: false, reason: "Enter a note." };
    case "markFraud":
      return i.fraudState && (FRAUD_VALUES as readonly string[]).includes(i.fraudState)
        ? { ok: true } : { ok: false, reason: "Pick a valid fraud-review state." };
    case "markWholesale":
      return i.wholesaleState && (WHOLESALE_VALUES as readonly string[]).includes(i.wholesaleState)
        ? { ok: true } : { ok: false, reason: "Pick a valid wholesale state." };
    case "linkIncident":
      return i.incidentNumber && i.incidentNumber.trim().length ? { ok: true } : { ok: false, reason: "Enter an incident number." };
    case "restore":
      return { ok: true };
  }
}

/** Human summary of what an action will do to N orders — for the confirm step. */
export function bulkConfirmText(action: BulkAction, count: number, detail: string): string {
  const n = `${count} order${count === 1 ? "" : "s"}`;
  switch (action) {
    case "assign": return `Assign ${n} to ${detail}?`;
    case "priority": return `Set priority of ${n} to ${detail}?`;
    case "addTags": return `Add tag(s) “${detail}” to ${n}?`;
    case "removeTags": return `Remove tag(s) “${detail}” from ${n}?`;
    case "note": return `Add an internal note to ${n}?`;
    case "markFraud": return `Set fraud review of ${n} to ${detail}?`;
    case "markWholesale": return `Set wholesale of ${n} to ${detail}?`;
    case "linkIncident": return `Link ${n} to incident ${detail}?`;
    case "restore": return `Undo the last change on ${n}?`;
  }
}

/** One row's undo record: the columns to restore to their prior values. */
export interface UndoRecord {
  orderNumber: string;
  patch: Record<string, unknown>; // e.g. { assigned_to: <prev> } or { ops_tags: [...] }
}
export interface BulkUndo {
  action: BulkAction; // the action that was performed (for the toast label)
  records: UndoRecord[];
}
