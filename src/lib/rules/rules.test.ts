import { describe, it, expect } from "vitest";
import { ruleMatches, runBusinessRules, type BusinessRule } from "@/lib/rules/engine";

const rule = (o: Partial<BusinessRule>): BusinessRule => ({
  id: "r", name: "r", trigger: "order.created", conditions: [], actions: [{ type: "noop" }], priority: 100, active: true, ...o,
});

describe("business rule engine (§12)", () => {
  it("evaluates comparison + membership operators", () => {
    const ctx = { order: { total: 3500, city: "Bengaluru", payment: "cod", types: ["candle", "room_spray"] } };
    expect(ruleMatches(rule({ conditions: [{ field: "order.total", op: "gt", value: 3000 }] }), ctx)).toBe(true);
    expect(ruleMatches(rule({ conditions: [{ field: "order.total", op: "lt", value: 3000 }] }), ctx)).toBe(false);
    expect(ruleMatches(rule({ conditions: [{ field: "order.city", op: "eq", value: "Bengaluru" }] }), ctx)).toBe(true);
    expect(ruleMatches(rule({ conditions: [{ field: "order.payment", op: "in", value: ["cod", "upi"] }] }), ctx)).toBe(true);
    expect(ruleMatches(rule({ conditions: [{ field: "order.types", op: "contains", value: "room_spray" }] }), ctx)).toBe(true);
  });

  it("ALL conditions must match (AND)", () => {
    const ctx = { order: { total: 3500, payment: "prepaid" } };
    const r = rule({ conditions: [{ field: "order.total", op: "gt", value: 3000 }, { field: "order.payment", op: "eq", value: "cod" }] });
    expect(ruleMatches(r, ctx)).toBe(false);
  });

  it("runBusinessRules filters by trigger + active, and returns actions in priority order", () => {
    const rules: BusinessRule[] = [
      rule({ id: "insure", priority: 20, conditions: [{ field: "order.total", op: "gt", value: 3000 }], actions: [{ type: "add_insurance" }] }),
      rule({ id: "cod-courier", priority: 10, conditions: [{ field: "order.payment", op: "eq", value: "cod" }], actions: [{ type: "set_courier", value: "delhivery" }] }),
      rule({ id: "gift", trigger: "order.packed", actions: [{ type: "gift_box" }] }), // wrong trigger
      rule({ id: "off", active: false, actions: [{ type: "never" }] }),
    ];
    const ctx = { order: { total: 3500, payment: "cod" } };
    const actions = runBusinessRules(rules, "order.created", ctx);
    expect(actions.map((a) => a.type)).toEqual(["set_courier", "add_insurance"]); // priority 10 before 20
    expect(actions.some((a) => a.type === "gift_box")).toBe(false);
    expect(actions.some((a) => a.type === "never")).toBe(false);
  });

  it("empty conditions always match", () => {
    expect(ruleMatches(rule({ conditions: [] }), {})).toBe(true);
  });
});
