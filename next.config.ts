import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Baseline security headers (full CSP is added in the Security phase, BRD §23.3 / Phase 16).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

// Config is a function of `phase` so the DEV server and a production BUILD write to DIFFERENT
// directories and can never collide. `next dev` → `.next-dev`; `next build` / `next start` (and
// Vercel, which runs `next build`) → the default `.next`. This permanently prevents the
// "routes-manifest.json ENOENT → 500" that happens when a `next build` overwrites the `.next` a
// running dev server is serving from. Production is unaffected (it only ever uses `.next`).
export default (phase: string): NextConfig => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  reactStrictMode: true,
  async redirects() {
    return [
      // Returns consolidation — the old short /returns page is retired in favour of the
      // full CMS-managed Returns & Refund Policy. 301 preserves any existing links/SEO.
      { source: "/returns", destination: "/returns-policy", statusCode: 301 },
    ];
  },
  images: {
    // Cloudinary is the primary image CDN (BRD §2.3).
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  // Next's build-time ESLint runner cannot see our flat config: hasEslintConfiguration() only looks
  // for `.eslintrc*` / package.json#eslintConfig, so with eslint.config.mjs it decides ESLint is
  // unconfigured and HANGS the build on an interactive "How would you like to configure ESLint?"
  // prompt. `next lint` is deprecated in 15.5 and gone in 16 anyway, so linting is a separate step:
  // `npm run build` runs it before next build (see package.json), which is also what Vercel runs.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
});
