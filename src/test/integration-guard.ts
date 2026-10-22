/**
 * FAIL-CLOSED integration-test database guard.
 *
 * Loaded as the FIRST setupFile of the `integration` vitest project, so it runs before any integration
 * test file — and therefore before any Supabase client — is imported. Its job: make it impossible for a
 * `*.integration.test.ts` suite to run against a hosted / production database by accident.
 *
 * HOW THE SUITES GET THEIR ENV: each integration file reads `.env.local` itself and sets any
 * `process.env` var that is still UNDEFINED (`if (process.env[k] === undefined) process.env[k] = ...`).
 * vite does NOT populate process.env here. So:
 *   1. This guard runs first and ACTIVELY loads `.env.test.local` (if present) into process.env. Because
 *      the suites only fill UNDEFINED vars, the local values set here WIN over `.env.local`.
 *   2. It then computes the EFFECTIVE value each suite will use for every Supabase URL var —
 *      `process.env[var]` (now possibly from `.env.test.local`) else the value in `.env.local` —
 *      and THROWS if any is a non-local host. No local override + a hosted `.env.local` ⇒ throw.
 *      No URL anywhere (CI with no env files) ⇒ no throw; the suites self-skip.
 *   3. Production-like JWT credentials (a local URL paired with a hosted-project JWT key) ⇒ throw.
 *
 * Secrets are never printed — only variable names and URL HOSTS appear in messages.
 * To run integration tests, create `.env.test.local` with LOCAL values (see `.env.test.local.example`).
 * Unit tests are DB-mocked and need none of this (`npx vitest run --project unit`).
 */
import { readFileSync } from "node:fs";

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|0\.0\.0\.0|::1|host\.docker\.internal)$/i;
const URL_VARS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "INV_TEST_SUPABASE_URL"] as const;
const KEY_VARS = ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "INV_TEST_SERVICE_KEY", "INV_TEST_ANON_KEY"] as const;

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      out[m[1]] = m[2].replace(/\r$/, "").trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* file absent */ }
  return out;
}

const hostOf = (raw: string): string | null => {
  try { return new URL(raw.trim()).hostname.replace(/^\[|\]$/g, ""); } catch { return null; }
};
const isLocalUrl = (raw: string): boolean => {
  const h = hostOf(raw);
  return !!h && LOCAL_HOST.test(h);
};

/** A hosted-project Supabase JWT decodes to a non-local issuer and carries a project `ref`. */
function isHostedJwt(key: string): boolean {
  if (!key.startsWith("eyJ")) return false; // local sb_publishable_/sb_secret_ keys are not JWTs
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64").toString("utf8"));
    return !!payload.ref && !/demo|local/i.test(String(payload.iss ?? ""));
  } catch { return false; }
}

// 1. Load .env.test.local FIRST so its LOCAL values win over the suites' own .env.local reader.
const testLocal = parseEnvFile(".env.test.local");
for (const [k, v] of Object.entries(testLocal)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

// 2. Compute the effective value each suite will use: process.env (incl. what we just set) else .env.local.
const envLocal = parseEnvFile(".env.local");
const effective = (v: string): string | undefined => process.env[v] ?? envLocal[v] ?? undefined;

const problems: string[] = [];
for (const v of URL_VARS) {
  const val = effective(v);
  if (val && !isLocalUrl(val)) problems.push(`${v} would resolve to a non-local host "${hostOf(val) ?? "?"}"`);
}
for (const k of KEY_VARS) {
  const val = process.env[k] ?? envLocal[k];
  if (val && isHostedJwt(val)) problems.push(`${k} is a hosted-project credential (JWT with a project ref) — use the local key`);
}

if (problems.length) {
  const lines = [...new Set(problems)].map((p) => `  • ${p}`).join("\n");
  throw new Error(
    "\n[integration-guard] REFUSING to run integration tests against a hosted / production database.\n" +
    lines +
    "\n\nIntegration tests must target a LOCAL Supabase (host 127.0.0.1 / localhost). To run them:\n" +
    "  1. npm run db:start && npm run db:reset\n" +
    "  2. create .env.test.local (gitignored) from .env.test.local.example with the LOCAL keys from\n" +
    "     `npm run db:status`. This guard loads it before the suites, so its local values win.\n" +
    "Unit tests are DB-mocked: npx vitest run --project unit\n",
  );
}
