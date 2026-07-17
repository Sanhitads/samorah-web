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
  // ESLint runs in the build. It is scoped to the Rules of Hooks (see eslint.config.mjs) — the one
  // bug class tsc and vitest are blind to, and the one that shipped a crashing checkout.
  eslint: { dirs: ["src"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
