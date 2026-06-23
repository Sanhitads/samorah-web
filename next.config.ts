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
  // TODO(Phase 16 — Security): wire ESLint into builds once the codebase is linted.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
