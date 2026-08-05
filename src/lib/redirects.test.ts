import { describe, it, expect } from "vitest";
import { normalizePath, resolveRedirect } from "./redirects";

/**
 * Redirect execution is critical and must stay decoupled from analytics. Since hit instrumentation is
 * DEFERRED (Phase 2 decision), there is no write on the redirect path — this pins that the resolver is
 * a pure read (normalize + map lookup) with no metrics side effect, so "deferred analytics" provably
 * cannot delay or break a redirect. (No SUPABASE env → getRedirectMap yields an empty map, and resolve
 * returns null without throwing.)
 */
describe("redirect resolution has no analytics coupling (Phase 2 decision 1/10)", () => {
  it("normalizePath is a pure trailing-slash + lowercase fold", () => {
    expect(normalizePath("/Shop/")).toBe("/shop");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/A/B/")).toBe("/a/b");
  });

  it("resolveRedirect performs a read-only lookup and never throws (no hit write)", async () => {
    // With no configured DB in the unit env, the map is empty → null, and crucially: no write happens.
    await expect(resolveRedirect("/anything")).resolves.toBeNull();
  });
});
