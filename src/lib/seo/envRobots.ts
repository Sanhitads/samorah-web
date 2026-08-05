import type { Metadata } from "next";

/**
 * Non-production indexing protection (SEO Phase 3 · point 27). Application-level, not deployment-level:
 * a `noindex,nofollow` robots directive is applied on preview/development so a preview URL can never be
 * indexed, while PRODUCTION always stays index/follow. Does not change deployment architecture — it only
 * reads the deployment's own env signals.
 *
 * Rule: on Vercel, `VERCEL_ENV` ("production" | "preview" | "development") is authoritative. Off-Vercel
 * (self-hosted `next start`, no VERCEL_ENV), fall back to NODE_ENV so an intentional production build
 * still indexes. This guarantees production is never accidentally given the preview noindex rule.
 */
export function isProductionDeploy(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}

/** Metadata.robots for the current environment: undefined (index/follow default) in production, an
 *  explicit noindex/nofollow object otherwise. */
export function robotsForEnv(env: NodeJS.ProcessEnv = process.env): Metadata["robots"] {
  return isProductionDeploy(env) ? undefined : { index: false, follow: false };
}
