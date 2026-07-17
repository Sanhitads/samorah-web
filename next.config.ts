import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
};

export default nextConfig;
