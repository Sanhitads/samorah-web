import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * REGRESSION — scripts/seed-catalog.mjs must REFUSE a hosted / non-local Supabase target by default.
 * It upserts the real catalogue and resets product_images, so an accidental hosted run could revert
 * live content. The guard runs before any DB client is created, so these spawns never touch a database.
 */
function run(args: string[], env: Record<string, string>): { code: number; out: string } {
  try {
    execFileSync(process.execPath, ["scripts/seed-catalog.mjs", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: "pipe",
    });
    return { code: 0, out: "" };
  } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return { code: typeof e.status === "number" ? e.status : 1, out: `${e.stderr ?? ""}${e.stdout ?? ""}` };
  }
}

const HOSTED = { NEXT_PUBLIC_SUPABASE_URL: "https://fake-project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x", SEED_CATALOG_ALLOW_HOSTED: "" };

describe("seed-catalog.mjs production guard", () => {
  it("rejects a hosted target with NO override (exit 1, refusal message)", () => {
    const r = run([], HOSTED);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Refusing to seed the catalogue into a non-local Supabase/);
  });

  it("rejects a hosted target even WITH --allow-hosted when SEED_CATALOG_ALLOW_HOSTED does not match the host (exit 1)", () => {
    const r = run(["--allow-hosted"], { ...HOSTED, SEED_CATALOG_ALLOW_HOSTED: "some-other-host" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Refusing to seed the catalogue into a non-local Supabase/);
  });
});
