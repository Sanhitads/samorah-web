// Preflight for `npm run test:integration`: FAIL LOUD when the LOCAL test database is not configured or
// not reachable — so an EXPLICIT integration request can never be mistaken for passing coverage when it
// would merely skip. (The fail-closed integration-guard still blocks any hosted URL inside vitest; this
// is the complementary check for the "no local prerequisites" case.)
import { readFileSync } from "node:fs";

const isLocal = (u) => { try { return /^(127\.0\.0\.1|localhost)$/i.test(new URL(u).hostname); } catch { return false; } };
const fromFile = (path, key) => {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
      if (m) return m[1].replace(/\r$/, "").trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* file absent */ }
  return undefined;
};

const url =
  process.env.INV_TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL ||
  fromFile(".env.test.local", "INV_TEST_SUPABASE_URL") || fromFile(".env.test.local", "NEXT_PUBLIC_SUPABASE_URL");

if (!url || !isLocal(url)) {
  console.error("\n✗ Integration tests require a LOCAL Supabase, which is not configured.");
  console.error("  1) npm run db:start && npm run db:reset");
  console.error("  2) create .env.test.local from .env.test.local.example (local keys from `npm run db:status`)");
  console.error("  then: npm run test:integration\n");
  process.exit(1);
}

const base = url.replace(/\/$/, "");
const reachable = await fetch(`${base}/rest/v1/`, { method: "HEAD" }).then(() => true).catch(() => false);
if (!reachable) {
  console.error(`\n✗ Local Supabase is configured (${new URL(url).host}) but not reachable — run: npm run db:start\n`);
  process.exit(1);
}
console.log(`✓ Local Supabase ready (${new URL(url).host}) — running integration tests.`);
