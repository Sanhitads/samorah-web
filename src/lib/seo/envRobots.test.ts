import { describe, it, expect } from "vitest";
import { isProductionDeploy, robotsForEnv } from "./envRobots";

const env = (o: Record<string, string | undefined>) => o as unknown as NodeJS.ProcessEnv;

describe("non-production indexing protection (point 27)", () => {
  it("Vercel PRODUCTION → indexable (no robots override)", () => {
    expect(isProductionDeploy(env({ VERCEL_ENV: "production", NODE_ENV: "production" }))).toBe(true);
    expect(robotsForEnv(env({ VERCEL_ENV: "production" }))).toBeUndefined();
  });

  it("Vercel PREVIEW → noindex,nofollow (even though NODE_ENV=production on Vercel builds)", () => {
    expect(isProductionDeploy(env({ VERCEL_ENV: "preview", NODE_ENV: "production" }))).toBe(false);
    expect(robotsForEnv(env({ VERCEL_ENV: "preview", NODE_ENV: "production" }))).toEqual({ index: false, follow: false });
  });

  it("Vercel DEVELOPMENT → noindex,nofollow", () => {
    expect(robotsForEnv(env({ VERCEL_ENV: "development" }))).toEqual({ index: false, follow: false });
  });

  it("self-hosted production (no VERCEL_ENV, NODE_ENV=production) → indexable", () => {
    expect(isProductionDeploy(env({ NODE_ENV: "production" }))).toBe(true);
    expect(robotsForEnv(env({ NODE_ENV: "production" }))).toBeUndefined();
  });

  it("local dev (no VERCEL_ENV, NODE_ENV=development) → noindex", () => {
    expect(robotsForEnv(env({ NODE_ENV: "development" }))).toEqual({ index: false, follow: false });
  });

  it("REGRESSION: production can never accidentally receive the preview noindex rule", () => {
    // Any signal that means production must yield index/follow (undefined robots).
    for (const e of [{ VERCEL_ENV: "production" }, { VERCEL_ENV: "production", NODE_ENV: "production" }, { NODE_ENV: "production" }]) {
      expect(robotsForEnv(env(e))).toBeUndefined();
    }
  });
});
