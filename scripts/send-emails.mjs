// Dev-only helper — drains the fulfillment queue by calling the same endpoint the
// production Vercel Cron hits: POST /api/cron/fulfillment with the CRON_SECRET.
// Saves reaching for curl/Postman. Production continues to use the scheduled cron.
//
//   npm run send-emails
//
// Refuses to run in production and refuses to target a non-local URL.

import { readFileSync } from "node:fs";

// ── Load .env.local (CRLF-safe), without clobbering real process env ──────────
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/\r$/, "").trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* no .env.local — fall back to process env */
}

if (process.env.NODE_ENV === "production") {
  console.error("✗ send-emails is a development-only command (NODE_ENV=production).");
  process.exit(1);
}

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("✗ CRON_SECRET is not set in .env.local — add it and retry.");
  process.exit(1);
}

const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)) {
  console.error(`✗ Refusing to run against a non-local URL: ${base}`);
  console.error("  This command only targets your local dev server.");
  process.exit(1);
}

const url = `${base}/api/cron/fulfillment`;
console.log(`→ POST ${url}`);

try {
  const res = await fetch(url, { method: "POST", headers: { "x-cron-secret": secret } });
  const text = await res.text();
  console.log(`← ${res.status} ${res.statusText}`);
  console.log(text);
  if (!res.ok) process.exit(1);
} catch (e) {
  console.error("✗ Request failed — is the dev server running?  (npm run dev)");
  console.error(`  ${e?.message ?? e}`);
  process.exit(1);
}
