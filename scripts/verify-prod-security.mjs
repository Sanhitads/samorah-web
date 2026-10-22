// Post-migration SECURITY smoke — anonymous execution of the privileged RPCs must be DENIED.
//
// The five functions revoked from anon by the 2026-10-16 migrations:
//   reserve_coupon, consume_coupon, release_coupon, restore_coupon  (parameterized)
//   analytics_refresh_mvs                                            (zero-arg)
//
// WHAT THIS PROVES — and its limits. It POSTs each RPC through the PUBLIC (anon) REST surface with an
// EMPTY body and asserts anon never gets a 2xx (i.e. never executes it). But PostgREST resolves the
// function OVERLOAD from the posted arguments BEFORE checking EXECUTE privilege, so an empty body to a
// REQUIRED-ARG function returns 404 (no matching overload) whether or not anon holds EXECUTE. Therefore:
//   • analytics_refresh_mvs (zero-arg) IS meaningfully probed — an empty body matches its signature, so
//     a 2xx would mean anon actually executed it (the one catastrophic outcome this guards).
//   • the four coupon RPCs can only be probed for "no 2xx"; their 404 is a signature mismatch, NOT proof
//     of the revoke. This script does NOT confirm the coupon revokes — the AUTHORITATIVE check is the
//     has_function_privilege('anon', …, 'EXECUTE') SQL in docs/deployment/DATABASE_MIGRATIONS.md
//     (expect all false). Treat a green run here as "anon executed nothing", not "revokes verified".
//
// SIDE EFFECTS: read-only in a healthy (revoked) system. The only function an empty body can reach is
// analytics_refresh_mvs — and only IF its revoke were MISSING, in which case this probe would trigger
// the MV refresh. That execution is itself the failure signal; a correctly-revoked project never runs it.
//
//   Local:       npm run verify:prod-security
//   Production:  NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… npm run verify:prod-security

import { readFileSync } from "node:fs";

// ── Load .env.local (CRLF-safe) without clobbering real process env ───────────
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/\r$/, "").trim().replace(/^["']|["']$/g, "");
    }
  }
} catch { /* no .env.local — use process env (prod/CI) */ }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  process.exit(1);
}

// zeroArg: an empty body matches the signature, so the EXECUTE check is actually reached → meaningful.
const RPCS = [
  { fn: "reserve_coupon", zeroArg: false },
  { fn: "consume_coupon", zeroArg: false },
  { fn: "release_coupon", zeroArg: false },
  { fn: "restore_coupon", zeroArg: false },
  { fn: "analytics_refresh_mvs", zeroArg: true },
];

console.log(`→ Probing anon execution of ${RPCS.length} privileged RPCs at ${url}`);
console.log("  (empty body; a 2xx = anon executed it = FAIL. Authoritative revoke proof is the has_function_privilege SQL.)\n");

let failed = 0, inconclusive = 0;
for (const { fn, zeroArg } of RPCS) {
  let status, code;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: "{}",
    });
    status = res.status;
    try { code = (await res.json())?.code; } catch { /* non-JSON body */ }
  } catch (e) {
    console.error(`  ? ${fn.padEnd(22)} probe error (${e.message}) — check the URL/network`);
    failed++;
    continue;
  }
  const executed = status >= 200 && status < 300;                 // anon actually ran it — never allowed
  const denied = status === 401 || status === 403 || status === 404;
  if (executed) {
    console.error(`  ✗ ${fn.padEnd(22)} ANON EXECUTED IT (HTTP ${status}) — revoke is MISSING. CRITICAL.`);
    failed++;
  } else if (zeroArg && denied) {
    console.log(`  ✓ ${fn.padEnd(22)} denied (HTTP ${status}${code ? ` ${code}` : ""}) — meaningfully verified (zero-arg)`);
  } else if (zeroArg) {
    console.error(`  ✗ ${fn.padEnd(22)} unexpected response (HTTP ${status}${code ? ` ${code}` : ""}) — investigate.`);
    failed++;
  } else {
    // parameterized: no 2xx, but HTTP can't distinguish revoked from arg-mismatch → defer to the SQL.
    console.log(`  • ${fn.padEnd(22)} no anon execution (HTTP ${status}${code ? ` ${code}` : ""}) — revoke NOT confirmed here; see has_function_privilege SQL`);
    inconclusive++;
  }
}

if (failed > 0) {
  console.error(`\n✗ ${failed} privileged RPC(s) are NOT safely denied to anon. Confirm the revoke migrations are applied and PostgREST reloaded.`);
  process.exit(1);
}
console.log(`\n✓ No privileged RPC executed for anon (${inconclusive} parameterized RPC(s) deferred to the has_function_privilege SQL).`);
console.log("  Run the authoritative DB-level check (expect all false): see docs/deployment/DATABASE_MIGRATIONS.md → Post-migration verification.");
process.exit(0);
