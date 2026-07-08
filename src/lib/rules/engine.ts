/**
 * Business Rule Engine (§12) — general trigger → condition → action. Generalises the
 * packaging rules so the business changes without code:
 *   IF order.total > 3000 → add insurance
 *   IF payment = COD → courier = delhivery
 *   IF city = Bengaluru → manual local delivery
 * Rules are data (business_rules table); this evaluates them. Pure.
 */
export type RuleOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "nin" | "contains";
export interface RuleCondition {
  field: string; // dot-path into the context, e.g. "order.total"
  op: RuleOp;
  value: unknown;
}
export interface RuleAction {
  type: string; // e.g. "add_insurance" | "set_courier" | "set_delivery_mode"
  value?: unknown;
}
export interface BusinessRule {
  id: string;
  name: string;
  trigger: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  active: boolean;
}
export type RuleContext = Record<string, unknown>;

function getField(ctx: RuleContext, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), ctx);
}

function evalCondition(c: RuleCondition, ctx: RuleContext): boolean {
  const v = getField(ctx, c.field);
  switch (c.op) {
    case "eq":
      return v === c.value;
    case "neq":
      return v !== c.value;
    case "gt":
      return Number(v) > Number(c.value);
    case "gte":
      return Number(v) >= Number(c.value);
    case "lt":
      return Number(v) < Number(c.value);
    case "lte":
      return Number(v) <= Number(c.value);
    case "in":
      return Array.isArray(c.value) && (c.value as unknown[]).includes(v);
    case "nin":
      return Array.isArray(c.value) && !(c.value as unknown[]).includes(v);
    case "contains":
      return Array.isArray(v) && (v as unknown[]).includes(c.value);
    default:
      return false;
  }
}

/** True when ALL conditions match (empty conditions = always). */
export function ruleMatches(rule: BusinessRule, ctx: RuleContext): boolean {
  return rule.conditions.every((c) => evalCondition(c, ctx));
}

/** All actions from active rules for `trigger` whose conditions match, in priority order. */
export function runBusinessRules(rules: BusinessRule[], trigger: string, ctx: RuleContext): RuleAction[] {
  return rules
    .filter((r) => r.active && r.trigger === trigger && ruleMatches(r, ctx))
    .sort((a, b) => a.priority - b.priority)
    .flatMap((r) => r.actions);
}
