import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * SECURITY REGRESSION — every admin API route must authorize the caller itself.
 *
 * The edge middleware only role-gates the `/admin` *page* path, NOT `/api/admin/*` (those start with
 * `/api`). So an admin API route's ONLY authorization is its own call to requireCapability()/requireStaff()
 * (both fail-closed). This test checks EACH exported HTTP handler individually (comments stripped), so a
 * route that guards one method but adds a second unguarded one — or whose guard is commented out — is
 * caught, not hidden by a guard token elsewhere in the file.
 */
const ADMIN_API = join(process.cwd(), "src", "app", "api", "admin");
const HTTP = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";
const GUARD = /requireCapability\s*\(|requireStaff\s*\(/;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(p));
    else if (entry.name === "route.ts") out.push(p);
  }
  return out;
}

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Scans one file: the non-alias handlers found, and which of them lack a guard. */
function scanHandlers(file: string): { handlers: string[]; bad: string[] } {
  const src = stripComments(readFileSync(file, "utf8"));
  const declRe = new RegExp(`export\\s+(?:async\\s+)?function\\s+(${HTTP})\\b|export\\s+const\\s+(${HTTP})\\s*=\\s*([^;\\n]*)`, "g");
  const decls: { name: string; index: number; alias: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(src))) {
    const name = m[1] ?? m[2];
    // `export const GET = POST` delegates to another handler → not independently checked.
    const alias = !!m[2] && new RegExp(`^(?:${HTTP})\\b`).test((m[3] ?? "").trim());
    decls.push({ name, index: m.index, alias });
  }
  const sorted = [...decls].sort((a, b) => a.index - b.index);
  const bad: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    if (d.alias) continue;
    const end = i + 1 < sorted.length ? sorted[i + 1].index : src.length;
    if (!GUARD.test(src.slice(d.index, end))) bad.push(d.name);
  }
  return { handlers: sorted.filter((d) => !d.alias).map((d) => d.name), bad };
}

describe("admin API routes are guarded", () => {
  const files = routeFiles(ADMIN_API);
  const scans = files.map((f) => ({ f, ...scanHandlers(f) }));

  it("found admin route files to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("the handler scan is NOT vacuous — it actually detects many HTTP handlers", () => {
    // Guards against a silently-broken detector passing the next test with zero handlers.
    const total = scans.reduce((n, s) => n + s.handlers.length, 0);
    expect(total).toBeGreaterThan(30);
  });

  it("every exported HTTP handler under src/app/api/admin calls requireCapability()/requireStaff()", () => {
    const offenders = scans
      .filter((s) => s.bad.length)
      .map((s) => `${s.f.slice(s.f.indexOf("src")).replace(/\\/g, "/")} [${s.bad.join(",")}]`);
    expect(offenders, `Unguarded admin HTTP handlers (no requireCapability/requireStaff in the handler body): ${offenders.join("; ")}`).toEqual([]);
  });
});
