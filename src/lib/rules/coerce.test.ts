import { describe, it, expect } from "vitest";
import { coerceValue } from "@/services/rulesAdminService";
import { ruleMatches, type BusinessRule } from "@/lib/rules/engine";

describe("coerceValue — typed rule values", () => {
  it("numbers, booleans, and comma-lists parse to real JSON types", () => {
    expect(coerceValue("gt", "3000")).toBe(3000);
    expect(coerceValue("eq", "true")).toBe(true);
    expect(coerceValue("eq", "cod")).toBe("cod");
    expect(coerceValue("in", "delhivery, bluedart")).toEqual(["delhivery", "bluedart"]);
    expect(coerceValue("in", "1, 2, 3")).toEqual([1, 2, 3]);
  });
});

describe("coerced values compare correctly in the engine", () => {
  const rule: BusinessRule = {
    id: "r1", name: "Insure high value", trigger: "order.created", priority: 100, active: true,
    conditions: [{ field: "order.total", op: "gt", value: coerceValue("gt", "3000") }],
    actions: [{ type: "add_insurance" }],
  };
  it("string form '3000' would NOT match a numeric total; coerced 3000 does", () => {
    expect(ruleMatches(rule, { order: { total: 5000 } })).toBe(true);
    expect(ruleMatches(rule, { order: { total: 2000 } })).toBe(false);
  });
  it("boolean coercion: isGift eq true", () => {
    const gift: BusinessRule = { ...rule, conditions: [{ field: "order.isGift", op: "eq", value: coerceValue("eq", "true") }] };
    expect(ruleMatches(gift, { order: { isGift: true } })).toBe(true);
    expect(ruleMatches(gift, { order: { isGift: false } })).toBe(false);
  });
});
