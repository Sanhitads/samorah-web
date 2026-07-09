import { describe, it, expect } from "vitest";
import { routeWarehouse } from "@/lib/logistics/routing";

// Lower priority number = higher priority (matches getWarehouses' ascending order).
const BLR = { id: "wh_blr", priority: 10, active: true, servesStates: [] as string[] };
const DEL = { id: "wh_del", priority: 90, active: true, servesStates: ["Delhi", "Haryana", "Punjab"] };
const MUM = { id: "wh_mum", priority: 80, active: false, servesStates: ["Maharashtra"] };

describe("routeWarehouse", () => {
  it("routes to the warehouse serving the delivery state", () => {
    expect(routeWarehouse("Delhi", [BLR, DEL])?.id).toBe("wh_del");
    expect(routeWarehouse("haryana", [BLR, DEL])?.id).toBe("wh_del"); // case-insensitive
  });
  it("falls back to highest-priority active when no warehouse serves the state", () => {
    expect(routeWarehouse("Kerala", [BLR, DEL])?.id).toBe("wh_blr");
  });
  it("ignores inactive warehouses even if they serve the state", () => {
    expect(routeWarehouse("Maharashtra", [BLR, MUM])?.id).toBe("wh_blr");
  });
  it("single-warehouse (empty servesStates) always routes to it", () => {
    expect(routeWarehouse("Anywhere", [BLR])?.id).toBe("wh_blr");
    expect(routeWarehouse(null, [BLR])?.id).toBe("wh_blr");
  });
  it("returns null when there is no active warehouse", () => {
    expect(routeWarehouse("Delhi", [{ ...BLR, active: false }])).toBeNull();
  });
  it("priority breaks ties (lower number = higher priority)", () => {
    const a = { id: "a", priority: 50, active: true, servesStates: ["Delhi"] };
    const b = { id: "b", priority: 10, active: true, servesStates: ["Delhi"] };
    expect(routeWarehouse("Delhi", [a, b])?.id).toBe("b");
  });
});
