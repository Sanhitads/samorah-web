import { describe, it, expect } from "vitest";
import { analyzeRedirectGraph, type RedirectEdge } from "./redirectGraph";

const G = (edges: [string, string][]): RedirectEdge[] => edges.map(([from, to], i) => ({ id: `e${i}`, from, to, enabled: true }));

describe("analyzeRedirectGraph (point 1 — redirect graph validation)", () => {
  it("BLOCKS a direct self-loop", () => {
    const r = analyzeRedirectGraph({ from: "/a", to: "/a" }, []);
    expect(r.errors.some((e) => /points to itself/i.test(e))).toBe(true);
  });

  it("BLOCKS an indirect loop a→b→c→a", () => {
    const existing = G([["/b", "/c"], ["/c", "/a"]]);
    const r = analyzeRedirectGraph({ from: "/a", to: "/b" }, existing); // completes the cycle
    expect(r.errors.some((e) => /redirect loop/i.test(e))).toBe(true);
    expect(r.errors[0]).toContain("/a → /b → /c → /a");
  });

  it("WARNS + offers the final destination on a chain (destination itself redirects)", () => {
    const existing = G([["/intermediate", "/final"]]);
    const r = analyzeRedirectGraph({ from: "/old", to: "/intermediate" }, existing);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => /already redirects to \/final/i.test(w))).toBe(true);
    expect(r.finalDestination).toBe("/final");
  });

  it("follows a multi-hop chain to the true terminal", () => {
    const existing = G([["/b", "/c"], ["/c", "/d"]]);
    const r = analyzeRedirectGraph({ from: "/a", to: "/b" }, existing);
    expect(r.errors).toEqual([]);
    expect(r.finalDestination).toBe("/d");
  });

  it("BLOCKS a duplicate/conflicting source", () => {
    const existing = G([["/a", "/x"]]);
    const r = analyzeRedirectGraph({ from: "/a", to: "/y" }, existing);
    expect(r.errors.some((e) => /already sends \/a/i.test(e))).toBe(true);
  });

  it("does NOT flag the row being edited as its own duplicate", () => {
    const existing: RedirectEdge[] = [{ id: "e1", from: "/a", to: "/x", enabled: true }];
    const r = analyzeRedirectGraph({ id: "e1", from: "/a", to: "/z" }, existing);
    expect(r.errors).toEqual([]);
  });

  it("ignores DISABLED existing redirects when building the live graph", () => {
    const existing: RedirectEdge[] = [{ id: "e1", from: "/b", to: "/a", enabled: false }];
    const r = analyzeRedirectGraph({ from: "/a", to: "/b" }, existing); // would loop only if /b→/a were active
    expect(r.errors).toEqual([]);
  });

  it("normalizes case + trailing slash (matches middleware)", () => {
    const r = analyzeRedirectGraph({ from: "/A/", to: "/a" }, []);
    expect(r.errors.some((e) => /points to itself/i.test(e))).toBe(true);
  });

  it("allows a plain valid redirect to a non-source destination", () => {
    const existing = G([["/foo", "/bar"]]);
    const r = analyzeRedirectGraph({ from: "/old", to: "/new-live-page" }, existing);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});
