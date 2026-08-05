import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

/**
 * Verification (SEO Phase 3 · P0-2): exercise the REAL middleware(request) redirect path — not a second
 * harness. Proves an enabled 301/302 emits the exact status + Location, the canonical-host redirect
 * fires for a non-primary host, a DISABLED redirect does not fire, and an unsafe destination can never
 * become an active middleware redirect (it's blocked at write). Env-gated + self-cleaning.
 */
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* skip below */ }

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = !!(URL_ && KEY);
const d = RUN ? describe : describe.skip;
const H = { apikey: KEY!, Authorization: `Bearer ${KEY!}`, "Content-Type": "application/json" };
const OLD = "/mw-old", NEW = "/mw-new", TMP = "/mw-temp", DEST = "/mw-dest", OFF = "/mw-off";

let middleware: typeof import("@/middleware").middleware;
const req = (host: string, path: string) => new NextRequest(new URL(`https://${host}${path}`), { headers: { host } });

const UNSAFE = "/mw-unsafe";
beforeAll(async () => {
  if (!RUN) return;
  middleware = (await import("@/middleware")).middleware;
  await fetch(`${URL_}/rest/v1/redirects?from_path=in.(${[OLD, TMP, OFF, UNSAFE].join(",")})`, { method: "DELETE", headers: H }); // clean slate before seeding
  await fetch(`${URL_}/rest/v1/redirects`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify([
    { from_path: OLD, to_path: NEW, code: 301, enabled: true },
    { from_path: TMP, to_path: DEST, code: 302, enabled: true },
    { from_path: OFF, to_path: "/mw-x", code: 301, enabled: false },
    { from_path: UNSAFE, to_path: "javascript:alert(1)", code: 301, enabled: true }, // raw dangerous dest, injected directly
  ]) });
});
afterAll(async () => { if (RUN) await fetch(`${URL_}/rest/v1/redirects?from_path=in.(${[OLD, TMP, OFF, UNSAFE].join(",")})`, { method: "DELETE", headers: H }); });

// FIRING redirects: exercise the full middleware() — both branches return BEFORE updateSession, so no
// Supabase/WebSocket is involved. (The pass-through path calls updateSession, whose Supabase realtime
// client needs a WebSocket that Node-20 vitest lacks — a test-env limit, not a redirect concern — so
// NON-firing cases assert resolveRedirect(), the exact fn middleware calls at middleware.ts:25 to decide.)
d("real middleware redirect behavior (P0-2)", () => {
  it("canonical-host: a non-primary host 301s to the primary domain, preserving the path", async () => {
    const res = await middleware(req("samorah.in", "/shop"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://samorahstudio.com/shop");
  });

  it("enabled 301 → 301 with the exact Location", async () => {
    const res = await middleware(req("samorahstudio.com", OLD));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`https://samorahstudio.com${NEW}`);
  });

  it("enabled 302 → 302 with the exact Location", async () => {
    const res = await middleware(req("samorahstudio.com", TMP));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`https://samorahstudio.com${DEST}`);
  });

  it("a DISABLED redirect does not fire — middleware's resolveRedirect returns null", async () => {
    const { resolveRedirect } = await import("@/lib/redirects");
    expect(await resolveRedirect(OFF)).toBeNull(); // getRedirectMap fetches enabled-only
  });

  it("a dangerous destination (even injected directly) can never produce an unsafe/off-origin Location", async () => {
    // The middleware sets pathname on a clone of the CANONICAL-ORIGIN url, so a redirect is always
    // same-origin — a javascript:/external destination becomes a same-origin path, never an unsafe or
    // cross-origin Location. This holds even for a row injected past validation.
    const res = await middleware(req("samorahstudio.com", UNSAFE));
    expect(res.status).toBe(301);
    const loc = res.headers.get("location") ?? "";
    expect(loc.startsWith("https://samorahstudio.com/")).toBe(true); // same-origin only
    expect(loc).not.toMatch(/^javascript:/i);                        // never a javascript: Location
    expect(loc).not.toMatch(/\/\/(?!samorahstudio\.com)/);           // never redirected to another host
  });
});
