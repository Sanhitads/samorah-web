import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 1 · points 10·11 — navigation scheduling + safe unpublish, against the real DB.
 * Uses the `footer` menu as a sandbox (no DB row today → resetMenu restores config) and the injectable
 * `now` on processCmsSchedule to simulate the window elapsing. Verifies: unpublish_at > publish_at
 * validation, predecessor pointers on publish, and that a scheduled unpublish reverts to the exact
 * revision it displaced (not chronological 2nd-newest) — falling back to config only when none exists.
 * Env-gated + self-cleaning.
 */
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* skip below */ }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = !!(URL && KEY);
const d = RUN ? describe : describe.skip;
const H = { apikey: KEY!, Authorization: `Bearer ${KEY!}`, "Content-Type": "application/json" };
const rest = (path: string) => fetch(`${URL}/rest/v1/${path}`, { headers: H }).then((r) => r.json());
const footerRow = () => rest("navigation_menus?id=eq.footer&select=status,published,published_revision_id,predecessor_revision_id,unpublish_at").then((r) => r[0]);

const A = [{ title: "A", links: [{ label: "A1", href: "/shop" }] }];
const B = [{ title: "B", links: [{ label: "B1", href: "/about" }] }];
let svc: typeof import("@/services/navigationService");
let preRevs = new Set<string>();

beforeAll(async () => {
  if (!RUN) return;
  svc = await import("@/services/navigationService");
  const existing = await rest("cms_revisions?resource_type=eq.navigation&resource_key=eq.footer&select=id");
  preRevs = new Set((existing ?? []).map((r: any) => r.id));
});
afterAll(async () => {
  if (!RUN) return;
  await svc.resetMenu("footer"); // delete the sandbox row → footer reverts to config
  const revs = await rest("cms_revisions?resource_type=eq.navigation&resource_key=eq.footer&select=id");
  const mine = (revs ?? []).map((r: any) => r.id).filter((id: string) => !preRevs.has(id));
  if (mine.length) await fetch(`${URL}/rest/v1/cms_revisions?id=in.(${mine.join(",")})`, { method: "DELETE", headers: H });
});

// Each test is fully self-contained (its own resetMenu + setup) so full-suite parallel load can't cascade.
d("navigation scheduling — validation + predecessor revert (real DB)", () => {
  it("rejects unpublish_at that is not after publish_at", async () => {
    await svc.resetMenu("footer");
    await svc.saveDraft("footer", A);
    const r = await svc.publishMenu("footer", { publishAt: "2026-09-01T00:00:00.000Z", unpublishAt: "2026-08-01T00:00:00.000Z" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/after the publish time/i);
  });

  it("immediate publish records the live revision; a second publish records its predecessor", async () => {
    await svc.resetMenu("footer");
    await svc.saveDraft("footer", A);
    await svc.publishMenu("footer", {});
    const revA = (await footerRow()).published_revision_id;
    expect(revA).toBeTruthy();

    await svc.saveDraft("footer", B);
    await svc.publishMenu("footer", { unpublishAt: new Date(Date.now() + 3600_000).toISOString() });
    const afterB = await footerRow();
    expect(afterB.status).toBe("published");
    expect(afterB.published).toEqual(B);
    expect(afterB.predecessor_revision_id).toBe(revA); // records the revision B displaced
    expect(afterB.published_revision_id).not.toBe(revA);
  });

  it("scheduled unpublish reverts to the revision it displaced (A), not config or 2nd-newest", async () => {
    await svc.resetMenu("footer");
    await svc.saveDraft("footer", A);
    await svc.publishMenu("footer", {}); // A live
    await svc.saveDraft("footer", B);
    await svc.publishMenu("footer", { unpublishAt: new Date(Date.now() + 3600_000).toISOString() }); // B live, predecessor = A
    const res = await svc.processCmsSchedule(Date.now() + 2 * 3600_000); // simulate the window elapsing
    expect(res.deactivated).toBeGreaterThanOrEqual(1);
    const reverted = await footerRow();
    expect(reverted.published).toEqual(A); // the displaced revision restored — NOT the code default
    expect(reverted.status).toBe("published");
    expect(reverted.unpublish_at).toBeNull();
  });

  it("unpublish with no predecessor falls back to config (never nav-less)", async () => {
    await svc.resetMenu("footer"); // clean slate → first publish has no predecessor
    await svc.saveDraft("footer", A);
    await svc.publishMenu("footer", { unpublishAt: new Date(Date.now() + 3600_000).toISOString() });
    await svc.processCmsSchedule(Date.now() + 2 * 3600_000);
    const row = await footerRow();
    expect(row.status).toBe("draft"); // draft → storefront uses code-config fallback, never empty
    expect(row.published).toBeNull();
  });
});
