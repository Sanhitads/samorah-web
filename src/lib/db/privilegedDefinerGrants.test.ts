import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * SECURITY REGRESSION — privileged `SECURITY DEFINER` RPCs must not be executable by the public
 * anon key. These functions run with the owner's rights and BYPASS Row-Level Security; if they keep
 * Postgres' default PUBLIC execute grant, anyone holding the anon key (which ships in every browser
 * bundle) can call them over PostgREST. This happened to the coupon RPCs and to analytics_refresh_mvs
 * (deployment-hardening review, 2026-10-16); this test stops the class of bug from returning.
 *
 * Static scan of supabase/migrations — needs no database, runs in CI. It is a fast tripwire; the
 * AUTHORITATIVE check is the live grant query (has_function_privilege over pg_proc) run during
 * `npm run db:reset` verification. Known static limitation: privileges are per-overload, so a NEW
 * exposed overload of an already-revoked function name is not detected here (no such overloads exist
 * today — verified against the catalog).
 */
const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const FILES = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const sql = FILES.map((f) => readFileSync(join(MIG_DIR, f), "utf8")).join("\n").toLowerCase();

/** The full `create … function` statement (header + dollar-quoted body + trailing options). */
function createStatementsFor(text: string): { name: string; stmt: string }[] {
  const out: { name: string; stmt: string }[] = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index);
    const dq = after.match(/\bas\s+(\$[a-z0-9_]*\$)/i); // dollar-quoted body opener
    let stmt: string;
    if (dq) {
      const open = after.indexOf(dq[1]) + dq[1].length;
      const close = after.indexOf(dq[1], open);
      const semi = after.indexOf(";", close === -1 ? open : close + dq[1].length);
      stmt = after.slice(0, semi === -1 ? Math.min(after.length, 2000) : semi); // whole statement incl. post-AS options
    } else {
      const semi = after.indexOf(";");
      stmt = after.slice(0, semi === -1 ? Math.min(after.length, 2000) : semi);
    }
    out.push({ name: m[1], stmt });
  }
  return out;
}

/**
 * SECURITY DEFINER functions that are INTENTIONALLY callable by anon/authenticated, each safe:
 *   • current_user_role — read-only helper the RLS policies themselves invoke (must be callable).
 *   • set_user_role     — self-guarded: `if not is_admin() then raise` (an admin's own session calls it).
 *   • handle_new_user / variants_ledger_opening — trigger functions; PostgREST cannot invoke them.
 */
const INTENTIONALLY_PUBLIC = new Set(["current_user_role", "set_user_role", "handle_new_user", "variants_ledger_opening"]);

/** Functions whose CURRENT (last) definition is SECURITY DEFINER — mirrors the live DB. */
function securityDefinerFunctions(): string[] {
  const status = new Map<string, boolean>();
  for (const f of FILES) {
    const text = readFileSync(join(MIG_DIR, f), "utf8").toLowerCase();
    for (const { name, stmt } of createStatementsFor(text)) status.set(name, stmt.includes("security definer"));
  }
  return [...status.entries()].filter(([, isDef]) => isDef).map(([name]) => name);
}

/** Is there a REVOKE … on function public.<name>( … ) from (public|anon|authenticated)? */
function isRevokedFromPublic(name: string): boolean {
  return new RegExp(`revoke[^;]*\\bpublic\\.${name}\\s*\\([^;]*from[^;]*(public|anon|authenticated)`, "i").test(sql);
}

/** The body of the (last) definition of a named function, for asserting on its contents. */
function functionBody(name: string): string {
  let body = "";
  for (const f of FILES) {
    const text = readFileSync(join(MIG_DIR, f), "utf8").toLowerCase();
    for (const s of createStatementsFor(text)) if (s.name === name) body = s.stmt;
  }
  return body;
}

describe("privileged SECURITY DEFINER RPC execute grants", () => {
  it("found a meaningful number of SECURITY DEFINER functions (scan is wired correctly)", () => {
    expect(securityDefinerFunctions().length).toBeGreaterThan(15);
  });

  it("every privileged SECURITY DEFINER function is revoked from public/anon/authenticated (or explicitly allowlisted)", () => {
    const offenders = securityDefinerFunctions().filter((n) => !INTENTIONALLY_PUBLIC.has(n) && !isRevokedFromPublic(n));
    expect(offenders, `These SECURITY DEFINER functions bypass RLS but are NOT revoked from anon/public — add a REVOKE migration or add to INTENTIONALLY_PUBLIC with justification: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the specific functions fixed in the hardening review are revoked", () => {
    for (const fn of ["reserve_coupon", "consume_coupon", "release_coupon", "restore_coupon", "analytics_refresh_mvs", "claim_due_notifications", "try_acquire_cron_lock", "release_cron_lock"]) {
      expect(isRevokedFromPublic(fn), `${fn} must be revoked from public/anon/authenticated`).toBe(true);
    }
  });
});

describe("concurrency-protection objects exist in migrations", () => {
  it("notification retry: claim_due_notifications's OWN body uses FOR UPDATE SKIP LOCKED + a claimed_at lease", () => {
    const body = functionBody("claim_due_notifications");
    expect(body).not.toBe("");
    expect(body).toContain("for update skip locked"); // the atomic claim primitive, inside THIS function
    expect(body).toContain("claimed_at");
    expect(sql).toMatch(/alter table public\.notification_log[\s\S]*claimed_at/);
  });

  it("notification retry recovery: claim reclaims stranded 'retrying' AND 'sending' rows, bounds re-sends via attempts, tracks delivered_recipients", () => {
    const body = functionBody("claim_due_notifications");
    expect(body).toContain("'retrying'");            // crashed during a retry
    expect(body).toContain("'sending'");             // crashed during the INITIAL attempt (stranded)
    expect(body).toMatch(/attempts\s*=\s*case/);     // revival increments attempts → bounded to the DLQ
    // manual retry / replay paths never take a claim lease → reclaim must fall back to last_attempt_at
    expect(body).toMatch(/coalesce\(claimed_at,\s*last_attempt_at\)/);
    expect(sql).toMatch(/alter table public\.notification_log[\s\S]*delivered_recipients/); // per-recipient tracking
  });

  it("cron run-lock: cron_locks table + try_acquire_cron_lock + release_cron_lock exist (serializes whole-pass crons)", () => {
    expect(sql).toMatch(/create table[\s\S]*public\.cron_locks/);
    expect(sql).toContain("function public.try_acquire_cron_lock");
    expect(sql).toContain("function public.release_cron_lock");
    // the acquire only steals an EXPIRED lease (now() may be pg_catalog-qualified under empty search_path)
    expect(functionBody("try_acquire_cron_lock")).toMatch(/locked_until\s*<\s*(?:pg_catalog\.)?now\(\)/);
  });

  it("escalation idempotency: UNIQUE (incident_id, level) on incident_escalations", () => {
    expect(sql).toMatch(/unique\s*\(\s*incident_id\s*,\s*level\s*\)/);
  });

  it("the three hardening definer functions pin a safe search_path in their CURRENT definition (empty preferred)", () => {
    // Empty search_path ('') is strictest; 'public' is also safe. A definer function with NO pinned
    // search_path is the vulnerability — fail if the current definition drops it entirely.
    for (const fn of ["claim_due_notifications", "try_acquire_cron_lock", "release_cron_lock"]) {
      expect(functionBody(fn), `${fn} must set a search_path`).toMatch(/set\s+search_path\s*(?:to|=)\s*(?:''|'public')/);
    }
  });
});
