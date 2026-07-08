// Dev-only helper — mark an order's shipment dispatched via the same endpoint an
// admin/webhook uses: POST /api/fulfillment/dispatch with the CRON_SECRET.
// Saves reaching for curl. Production uses the admin dashboard / provider webhook.
//
//   npm run dispatch SAM-2026-000004
//
// Refuses to run in production and refuses to target a non-local URL.

import { readFileSync } from "node:fs";

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

const orderNumber = process.argv[2];
if (!orderNumber) {
  console.error("✗ Usage: npm run dispatch <orderNumber>   e.g.  npm run dispatch SAM-2026-000004");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("✗ dispatch is a development-only command (NODE_ENV=production).");
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
  process.exit(1);
}

const url = `${base}/api/fulfillment/dispatch`;
console.log(`→ POST ${url}  { orderNumber: "${orderNumber}" }`);

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-cron-secret": secret, "Content-Type": "application/json" },
    body: JSON.stringify({ orderNumber }),
  });
  const text = await res.text();
  console.log(`← ${res.status} ${res.statusText}`);
  console.log(text);
  if (res.ok) console.log("\nNext: run  npm run send-emails  to send the dispatch notification.");
  if (!res.ok) process.exit(1);
} catch (e) {
  console.error("✗ Request failed — is the dev server running?  (npm run dev)");
  console.error(`  ${e?.message ?? e}`);
  process.exit(1);
}
