/**
 * Phase 2 (collaboration) pure-logic tests — the config-driven pieces (team routing, checklist
 * templates) and the free-text search predicate. DB-coupled mutations are exercised by the live
 * scenario script; here we lock the deterministic behaviour the UI depends on.
 */
import { describe, it, expect } from "vitest";
import { matchesIncidentSearch } from "./engine";
import { CATEGORY_TEAM, INCIDENT_CHECKLISTS, INCIDENT_TEAMS, TEAM_LABEL, INCIDENT_CATEGORY_LABEL, type IncidentCategory } from "@/config/incidents";

describe("category → team routing", () => {
  it("routes every category to a known team", () => {
    for (const cat of Object.keys(INCIDENT_CATEGORY_LABEL) as IncidentCategory[]) {
      const team = CATEGORY_TEAM[cat];
      expect(INCIDENT_TEAMS).toContain(team);
      expect(TEAM_LABEL[team]).toBeTruthy();
    }
  });
  it("routes money categories to Finance and logistics to Warehouse", () => {
    expect(CATEGORY_TEAM.refund).toBe("finance");
    expect(CATEGORY_TEAM.payment_gateway).toBe("finance");
    expect(CATEGORY_TEAM.shipment).toBe("warehouse");
    expect(CATEGORY_TEAM.inventory).toBe("warehouse");
    expect(CATEGORY_TEAM.email).toBe("marketing");
  });
});

describe("checklist templates", () => {
  it("has a non-empty template for refund with the spec'd steps", () => {
    const items = INCIDENT_CHECKLISTS.refund ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(items).toEqual(expect.arrayContaining(["Retry refund", "Verify gateway status", "Inform customer", "Confirm settlement"]));
  });
  it("templates contain no blank labels", () => {
    for (const items of Object.values(INCIDENT_CHECKLISTS)) {
      for (const label of items ?? []) expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("matchesIncidentSearch", () => {
  const fields = ["INC-00007", "Refund failures — gateway timeout", "Gateway timeout", "Razorpay", "Asha Menon", null, "finance"];
  it("matches incident number, title, root cause, gateway, assignee, and team (case-insensitive)", () => {
    expect(matchesIncidentSearch(fields, "inc-00007")).toBe(true);
    expect(matchesIncidentSearch(fields, "GATEWAY")).toBe(true);
    expect(matchesIncidentSearch(fields, "razorpay")).toBe(true);
    expect(matchesIncidentSearch(fields, "asha")).toBe(true);
    expect(matchesIncidentSearch(fields, "finance")).toBe(true);
  });
  it("returns true for an empty term (no filter) and false for a non-match", () => {
    expect(matchesIncidentSearch(fields, "")).toBe(true);
    expect(matchesIncidentSearch(fields, "   ")).toBe(true);
    expect(matchesIncidentSearch(fields, "shiprocket")).toBe(false);
  });
  it("tolerates null/undefined fields without throwing", () => {
    expect(matchesIncidentSearch([null, undefined, "hello"], "hello")).toBe(true);
    expect(matchesIncidentSearch([null, undefined], "x")).toBe(false);
  });
});
