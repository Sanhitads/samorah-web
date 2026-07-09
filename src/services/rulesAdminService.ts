/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Business Rules admin service (build #5). The rule ENGINE already evaluates rules
 * (lib/rules/engine); this is the CRUD + dry-run so Admin can change how the business
 * behaves without a deploy (principle f). Every change is audited. `testRule` lets an
 * admin see what a rule (or the whole set) does against a sample order BEFORE
 * activating it — the guardrail against a misconfigured rule silently mis-shipping.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ruleMatches, type BusinessRule, type RuleCondition, type RuleAction, type RuleOp } from "@/lib/rules/engine";
import { logEvent } from "@/services/auditService";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

export const RULE_TRIGGERS = ["order.created", "shipment.pending", "shipment.create"] as const;
export const RULE_FIELDS = [
  "order.total",
  "order.weightKg",
  "order.paymentMode",
  "order.city",
  "order.state",
  "order.isGift",
  "order.itemCount",
  "order.fragile",
] as const;
export const RULE_OPS: RuleOp[] = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "nin", "contains"];
export const RULE_ACTIONS = ["add_insurance", "set_courier", "set_provider", "set_delivery_mode", "set_packaging_profile", "add_surcharge"] as const;

/** Coerce a raw string value into the right JSON type for the op (so eq/gt compare correctly). */
export function coerceValue(op: RuleOp, raw: unknown): unknown {
  if (op === "in" || op === "nin") {
    if (Array.isArray(raw)) return raw;
    return String(raw ?? "").split(",").map((s) => coerceScalar(s.trim()));
  }
  return coerceScalar(raw);
}
function coerceScalar(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s !== "" && !isNaN(Number(s))) return Number(s);
  return s;
}

export interface RuleInput {
  name: string;
  trigger: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority?: number;
  active?: boolean;
}

function normalize(input: RuleInput): RuleInput {
  return {
    ...input,
    conditions: (input.conditions ?? []).map((c) => ({ field: c.field, op: c.op, value: coerceValue(c.op, c.value) })),
    actions: (input.actions ?? []).map((a) => ({ type: a.type, value: coerceScalar(a.value) })),
  };
}

/** All rules (active + inactive), priority order — the admin list. */
export async function listRules(): Promise<BusinessRule[]> {
  const db = loose();
  const { data } = await db.from("business_rules").select("*").order("priority");
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    trigger: r.trigger,
    conditions: Array.isArray(r.conditions) ? r.conditions : [],
    actions: Array.isArray(r.actions) ? r.actions : [],
    priority: Number(r.priority ?? 100),
    active: Boolean(r.active),
  }));
}

export async function createRule(input: RuleInput, actorId?: string): Promise<{ ok: boolean; id?: string; reason?: string }> {
  if (!input.name?.trim()) return { ok: false, reason: "name required" };
  const n = normalize(input);
  const db = loose();
  const { data, error } = await db
    .from("business_rules")
    .insert({ name: n.name.trim(), trigger: n.trigger, conditions: n.conditions, actions: n.actions, priority: n.priority ?? 100, active: n.active ?? true })
    .select("id")
    .single();
  if (error || !data) return { ok: false, reason: error?.message ?? "insert failed" };
  await logEvent({ entityType: "rule", entityId: data.id, event: "rule.created", actorType: actorId ? "staff" : "system", actorId, notes: n.name, metadata: { trigger: n.trigger } });
  return { ok: true, id: data.id };
}

export async function updateRule(id: string, input: RuleInput, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const n = normalize(input);
  const db = loose();
  const { error } = await db
    .from("business_rules")
    .update({ name: n.name.trim(), trigger: n.trigger, conditions: n.conditions, actions: n.actions, priority: n.priority ?? 100, active: n.active ?? true })
    .eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "rule", entityId: id, event: "rule.updated", actorType: actorId ? "staff" : "system", actorId, notes: n.name });
  return { ok: true };
}

export async function toggleRule(id: string, active: boolean, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = loose();
  const { error } = await db.from("business_rules").update({ active }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "rule", entityId: id, event: active ? "rule.activated" : "rule.deactivated", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export async function deleteRule(id: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = loose();
  const { error } = await db.from("business_rules").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "rule", entityId: id, event: "rule.deleted", actorType: actorId ? "staff" : "system", actorId });
  return { ok: true };
}

export interface RuleTestResult {
  ruleId: string;
  name: string;
  trigger: string;
  active: boolean;
  matched: boolean;
  actions: RuleAction[];
}

/**
 * Dry-run: evaluate ALL rules against a sample order context and report which match.
 * `context` fields mirror RULE_FIELDS (order.total, order.paymentMode, …). Pure read.
 */
export async function testRules(context: Record<string, unknown>): Promise<RuleTestResult[]> {
  const rules = await listRules();
  // Build the nested context the engine reads (order.*).
  const ctx = { order: context };
  return rules.map((r) => ({
    ruleId: r.id,
    name: r.name,
    trigger: r.trigger,
    active: r.active,
    matched: ruleMatches(r, ctx),
    actions: r.actions,
  }));
}
